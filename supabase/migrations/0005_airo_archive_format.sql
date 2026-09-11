-- Canonical AIRO archive format. Existing rows, ownership and grants are preserved.
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
notify pgrst, 'reload schema';
