-- One account-owned model for the deployed service and existing personal data.
alter table public.trips add column if not exists source_key text;
create unique index if not exists trips_import_source_idx on public.trips(user_id, source_key) where source_key is not null;
alter table public.stops drop constraint if exists stops_day_check;
alter table public.stops add constraint stops_day_check check (day >= 0 and day <= 3650);
alter table public.stops add column if not exists source_id text;
alter table public.stops add column if not exists date text;
alter table public.stops add constraint stops_position_check check (position >= 0);

create table public.trip_archives (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  data jsonb not null,
  imported_at timestamptz not null default now()
);
create table public.saved_places (
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id text not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, place_id)
);
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  in_tokens int not null check (in_tokens >= 0),
  out_tokens int not null check (out_tokens >= 0),
  usd numeric not null check (usd >= 0),
  created_at timestamptz not null default now()
);
create index usage_user_idx on public.usage(user_id, created_at desc);

alter table public.trip_archives enable row level security;
alter table public.saved_places enable row level security;
alter table public.usage enable row level security;
create policy archive_own on public.trip_archives for all to authenticated
  using (exists(select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists(select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy saved_own on public.saved_places for all to authenticated
  using (exists(select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists(select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy usage_own on public.usage for select to authenticated using (user_id = auth.uid());
create policy usage_insert_own on public.usage for insert to authenticated
  with check (user_id = auth.uid() and exists(select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
grant select, insert, update, delete on public.trip_archives, public.saved_places to authenticated;
grant select, insert on public.usage to authenticated;

-- The same lock covers ordinary creation and import, including concurrent requests.
create or replace function public.enforce_trip_limit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if not exists(select 1 from public.subscriptions where user_id = new.user_id and plan = 'pro' and status = 'active')
     and (select count(*) from public.trips where user_id = new.user_id) >= 3 then
    raise exception '무료 플랜은 여행 3개까지 만들 수 있습니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trips_limit before insert on public.trips for each row execute function public.enforce_trip_limit();

-- A single transaction. Any invalid child row rolls back the entire import.
-- Identity comes exclusively from the verified session; no caller-supplied user ID.
create or replace function public.import_trip(p_archive jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  new_trip uuid;
  source text := p_archive->>'source_key';
begin
  if owner_id is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if p_archive->>'format' is distinct from 'airo-trip' or p_archive->>'version' is distinct from '1'
     or source is null or length(source) not between 1 and 240
     or octet_length(p_archive::text) > 12582912
     or jsonb_typeof(p_archive->'stops') is distinct from 'array'
     or jsonb_typeof(p_archive->'data') is distinct from 'object' then
    raise exception '지원하지 않는 여행 파일입니다.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select id into new_trip from public.trips where user_id = owner_id and source_key = source;
  if found then return jsonb_build_object('tripId', new_trip, 'imported', false); end if;

  insert into public.trips(user_id, title, start_date, created_at, source_key)
  values(owner_id, p_archive->'trip'->>'title', (p_archive->'trip'->>'start_date')::date,
    coalesce((p_archive->'trip'->>'created_at')::timestamptz, now()), source)
  returning id into new_trip;

  insert into public.stops(trip_id, source_id, name, lng, lat, day, position, time, note, map_query, mode, date)
  select new_trip, s.source_id, s.name, s.lng, s.lat, s.day, coalesce(s.position, (a.n - 1)::int),
    s.time, s.note, s.map_query, coalesce(s.mode, 'ground'), s.date
  from jsonb_array_elements(p_archive->'stops') with ordinality as a(value, n)
  cross join lateral jsonb_to_record(a.value) as s(
    source_id text, name text, lng float8, lat float8, day int, position int,
    time text, note text, map_query text, mode text, date text);

  insert into public.messages(trip_id, role, content, created_at)
  select new_trip, m.role, m.content, m.created_at
  from jsonb_to_recordset(coalesce(p_archive->'messages', '[]'::jsonb)) as m(role text, content text, created_at timestamptz);
  insert into public.trip_archives(trip_id, data) values(new_trip, p_archive->'data');
  insert into public.saved_places(trip_id, place_id)
  select new_trip, value from jsonb_array_elements_text(coalesce(p_archive->'data'->'savedPlaceIds', '[]'::jsonb))
  on conflict do nothing;
  return jsonb_build_object('tripId', new_trip, 'imported', true);
end;
$$;
revoke all on function public.import_trip(jsonb) from public, anon;
grant execute on function public.import_trip(jsonb) to authenticated;

create or replace function public.reorder_stops(p_trip uuid, p_day int, p_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.trips where id = p_trip and user_id = auth.uid()) then
    raise exception '여행을 찾을 수 없습니다.' using errcode = '42501';
  end if;
  if cardinality(p_ids) <> (select count(distinct id) from public.stops where trip_id = p_trip and day = p_day and id = any(p_ids)) then
    raise exception '일정 순서가 올바르지 않습니다.';
  end if;
  update public.stops s set position = ordered.pos - 1
  from (select id, row_number() over(order by array_position(p_ids, id) nulls last, position, id)::int as pos
        from public.stops where trip_id = p_trip and day = p_day) ordered
  where s.id = ordered.id;
end;
$$;
revoke all on function public.reorder_stops(uuid, int, uuid[]) from public, anon;
grant execute on function public.reorder_stops(uuid, int, uuid[]) to authenticated;

-- Persistent per-account quota; independent of IP headers and server replicas.
create table public.chat_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index chat_requests_user_idx on public.chat_requests(user_id, created_at desc);
alter table public.chat_requests enable row level security;
create policy chat_requests_read on public.chat_requests for select to authenticated using (user_id = auth.uid());
create policy chat_requests_insert on public.chat_requests for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.chat_requests to authenticated;
revoke update, delete on public.chat_requests from authenticated;
create or replace function public.consume_chat_request(p_trip uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or not exists(select 1 from public.trips where id = p_trip and user_id = owner_id) then
    raise exception '여행을 찾을 수 없습니다.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('chat:' || owner_id::text, 0));
  if (select count(*) from public.chat_requests where user_id = owner_id and created_at > now() - interval '1 hour') >= 30 then return false; end if;
  insert into public.chat_requests(user_id) values(owner_id);
  return true;
end;
$$;
revoke all on function public.consume_chat_request(uuid) from public, anon;
grant execute on function public.consume_chat_request(uuid) to authenticated;
