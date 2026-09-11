-- Apply after 0005. Deliberately not applied by the implementation agent.
-- All app/MCP stop writes lock the owned trip first, then change rows in one transaction.
create table public.mutation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (length(request_id) between 8 and 120),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table public.mutation_receipts enable row level security;
create policy mutation_receipts_own on public.mutation_receipts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.mutation_receipts to authenticated;

create or replace function public.mutate_itinerary(p_trip uuid, p_operation text, p_payload jsonb, p_request_id text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  envelope jsonb := jsonb_build_object('tripId', p_trip, 'operation', p_operation, 'input', p_payload);
  receipt public.mutation_receipts%rowtype;
  current_stop public.stops%rowtype;
  anchor public.stops%rowtype;
  changed public.stops%rowtype;
  target_day int;
  old_day int;
  idx int;
  ids uuid[];
  requested uuid[];
  target_id uuid;
  anchor_id uuid;
  result jsonb;
begin
  if owner_id is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 100000 then raise exception '변경 내용이 올바르지 않습니다.'; end if;
  if p_request_id is not null then
    if length(p_request_id) not between 8 and 120 then raise exception 'requestId가 올바르지 않습니다.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mutation:' || owner_id::text || ':' || p_request_id, 0));
    select * into receipt from public.mutation_receipts where user_id = owner_id and request_id = p_request_id;
    if found then
      if receipt.payload <> envelope then raise exception '같은 requestId에 다른 변경을 지정할 수 없습니다.'; end if;
      return receipt.result;
    end if;
  end if;
  perform 1 from public.trips where id = p_trip and user_id = owner_id for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;

  if p_operation = 'reorder' then
    target_day := (p_payload->>'day')::int;
    select array_agg(value::uuid order by n) into requested from jsonb_array_elements_text(p_payload->'stopIds') with ordinality a(value,n);
    requested := coalesce(requested, '{}'::uuid[]);
    if cardinality(requested) <> (select count(distinct id) from public.stops where trip_id = p_trip and day = target_day and id = any(requested)) then
      raise exception '이 일차에 속한 장소 ID를 중복 없이 지정하세요.';
    end if;
    select array_agg(id order by array_position(requested,id) nulls last, position, id) into ids
      from public.stops where trip_id = p_trip and day = target_day;
    update public.stops s set position = a.n::int - 1 from unnest(ids) with ordinality a(id,n) where s.id = a.id;
    result := jsonb_build_object('order', coalesce(to_jsonb(ids), '[]'::jsonb));
  elsif p_operation = 'remove' then
    delete from public.stops where trip_id = p_trip and id = (p_payload->>'stopId')::uuid returning * into current_stop;
    if found then
      update public.stops s set position = a.pos from
        (select id, (row_number() over(order by position,id) - 1)::int pos from public.stops where trip_id = p_trip and day = current_stop.day) a
        where s.id = a.id;
      result := jsonb_build_object('removed',true);
    else result := jsonb_build_object('removed',false); end if;
  elsif p_operation in ('add','move') then
    if (case when p_payload ? 'afterStopId' then 1 else 0 end + case when p_payload ? 'beforeStopId' then 1 else 0 end + case when p_payload ? 'position' then 1 else 0 end) > 1 then
      raise exception '삽입 기준은 하나만 지정하세요.';
    end if;
    if p_operation = 'move' then
      target_id := (p_payload->>'stopId')::uuid;
      select * into current_stop from public.stops where trip_id = p_trip and id = target_id;
      if not found then return jsonb_build_object('stop',null); end if;
      old_day := current_stop.day;
    else target_id := gen_random_uuid(); end if;
    anchor_id := coalesce(p_payload->>'afterStopId',p_payload->>'beforeStopId')::uuid;
    if anchor_id is not null then
      select * into anchor from public.stops where trip_id = p_trip and id = anchor_id;
      if not found or anchor_id = target_id then raise exception '삽입 기준 장소를 확인하세요.'; end if;
    end if;
    target_day := coalesce((p_payload->>'day')::int,anchor.day,current_stop.day);
    if target_day is null or target_day not between 0 and 3650 or (anchor_id is not null and anchor.day <> target_day) then
      raise exception '삽입 기준 장소와 같은 일차를 지정하세요.';
    end if;
    select coalesce(array_agg(id order by position,id),'{}'::uuid[]) into ids from public.stops where trip_id = p_trip and day = target_day and id <> target_id;
    if anchor_id is not null then idx := array_position(ids,anchor_id) - case when p_payload ? 'beforeStopId' then 1 else 0 end;
    elsif p_payload ? 'position' then idx := least((p_payload->>'position')::int,cardinality(ids));
    elsif old_day = target_day then
      select count(*)::int into idx from public.stops where trip_id = p_trip and day = target_day and (position,id) < (current_stop.position,current_stop.id);
    else idx := cardinality(ids); end if;
    if idx < 0 then raise exception '순서는 0 이상이어야 합니다.'; end if;
    if p_operation = 'add' then
      insert into public.stops(id,trip_id,name,lng,lat,day,position,time,note,map_query,mode)
      values(target_id,p_trip,p_payload->>'name',(p_payload->>'lng')::float8,(p_payload->>'lat')::float8,target_day,idx,
        p_payload->>'time',p_payload->>'note',p_payload->>'map_query',coalesce(p_payload->>'mode','ground'));
    else
      update public.stops set
        name = case when p_payload ? 'name' then p_payload->>'name' else name end,
        lng = case when p_payload ? 'lng' then (p_payload->>'lng')::float8 else lng end,
        lat = case when p_payload ? 'lat' then (p_payload->>'lat')::float8 else lat end,
        day = target_day, position = idx,
        time = case when p_payload ? 'time' then p_payload->>'time' else time end,
        note = case when p_payload ? 'note' then p_payload->>'note' else note end,
        map_query = case when p_payload ? 'map_query' then p_payload->>'map_query' else map_query end,
        mode = case when p_payload ? 'mode' then p_payload->>'mode' else mode end
      where id = target_id and trip_id = p_trip;
    end if;
    ids := coalesce(ids[1:idx],'{}'::uuid[]) || array[target_id] || coalesce(ids[idx+1:cardinality(ids)],'{}'::uuid[]);
    update public.stops s set position = a.n::int - 1 from unnest(ids) with ordinality a(id,n) where s.id = a.id;
    if old_day is not null and old_day <> target_day then
      update public.stops s set position = a.pos from
        (select id, (row_number() over(order by position,id) - 1)::int pos from public.stops where trip_id = p_trip and day = old_day) a
        where s.id = a.id;
    end if;
    select * into changed from public.stops where id = target_id;
    result := jsonb_build_object('stop',to_jsonb(changed));
  else raise exception '지원하지 않는 일정 변경입니다.'; end if;
  if p_request_id is not null then
    insert into public.mutation_receipts(user_id,request_id,payload,result) values(owner_id,p_request_id,envelope,result);
  end if;
  return result;
end;
$$;
revoke all on function public.mutate_itinerary(uuid,text,jsonb,text) from public,anon;
grant execute on function public.mutate_itinerary(uuid,text,jsonb,text) to authenticated;

-- Keep older clients on the same lock/order rules.
create or replace function public.reorder_stops(p_trip uuid,p_day int,p_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.mutate_itinerary(p_trip,'reorder',jsonb_build_object('day',p_day,'stopIds',p_ids));
end;
$$;

create or replace function public.create_trip_once(p_title text,p_start_date date default null,p_request_id text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  envelope jsonb := jsonb_build_object('operation','createTrip','title',p_title,'startDate',p_start_date);
  receipt public.mutation_receipts%rowtype;
  created public.trips%rowtype;
  result jsonb;
begin
  if owner_id is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 120 then raise exception '여행 이름을 확인하세요.'; end if;
  if p_request_id is not null then
    if length(p_request_id) not between 8 and 120 then raise exception 'requestId가 올바르지 않습니다.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mutation:' || owner_id::text || ':' || p_request_id,0));
    select * into receipt from public.mutation_receipts where user_id = owner_id and request_id = p_request_id;
    if found then
      if receipt.payload <> envelope then raise exception '같은 requestId에 다른 변경을 지정할 수 없습니다.'; end if;
      return receipt.result;
    end if;
  end if;
  insert into public.trips(user_id,title,start_date) values(owner_id,trim(p_title),p_start_date) returning * into created;
  result := jsonb_build_object('trip',to_jsonb(created));
  if p_request_id is not null then
    insert into public.mutation_receipts(user_id,request_id,payload,result) values(owner_id,p_request_id,envelope,result);
  end if;
  return result;
end;
$$;
revoke all on function public.create_trip_once(text,date,text) from public,anon;
grant execute on function public.create_trip_once(text,date,text) to authenticated;
