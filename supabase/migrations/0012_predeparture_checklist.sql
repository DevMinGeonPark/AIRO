-- Day 0 checklists share archive ownership, export and revision semantics.
create function public.update_trip_predeparture(p_trip uuid, p_value jsonb, p_revision integer) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_data jsonb; current_revision integer; result jsonb; items jsonb;
begin
  if not public.airo_mcp_allowed(true) then raise exception '편집 권한이 필요합니다.' using errcode = '42501'; end if;
  perform 1 from public.trips where id = p_trip and user_id = auth.uid() for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_value) is distinct from 'object' or p_revision is null or p_revision not between 0 and 2147483645
    or octet_length(p_value::text) > 131072 then raise exception 'Todo 형식을 확인하세요.' using errcode = '22023'; end if;
  items := p_value->'items';
  if jsonb_typeof(items) is distinct from 'array' then raise exception 'Todo 목록이 필요합니다.' using errcode = '22023'; end if;
  if jsonb_array_length(items) > 100 or exists(select 1 from jsonb_array_elements(items) e where
    jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'title') is distinct from 'string'
    or coalesce(length(trim(e->>'title')),0) not between 1 and 200
    or coalesce(e->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(e->>'category','') not in ('packing','documents','tasks')
    or jsonb_typeof(e->'done') is distinct from 'boolean')
    or (select count(*) <> count(distinct e->>'id') from jsonb_array_elements(items) e) then
    raise exception 'Todo 항목을 확인하세요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,8));
  insert into public.trip_archives(trip_id,data) values(p_trip,'{}') on conflict do nothing;
  select data into current_data from public.trip_archives where trip_id = p_trip for update;
  current_revision := coalesce((current_data->'predepartureChecklist'->>'revision')::integer,0);
  if current_revision <> p_revision then raise exception 'Todo가 변경됐습니다.' using errcode = '40001'; end if;
  result := jsonb_build_object('items',items,'revision',current_revision + 1);
  current_data := jsonb_set(current_data,'{predepartureChecklist}',result,true);
  if octet_length(current_data::text) > 8388608 then raise exception '보관 자료는 최대 8 MiB입니다.' using errcode = '22023'; end if;
  update public.trip_archives set data = current_data where trip_id = p_trip;
  return result;
end;
$$;
revoke all on function public.update_trip_predeparture(uuid,jsonb,integer) from public, anon;
grant execute on function public.update_trip_predeparture(uuid,jsonb,integer) to authenticated;

-- Include checklist changes in existing history and undo without rolling revisions back.
create or replace function public.record_trip_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  trip_key uuid;
  field text;
  before_value jsonb;
  after_value jsonb;
  delta jsonb := '{}';
  previous jsonb;
  touched uuid[];
  stop_key uuid;
begin
  if tg_table_name = 'trips' then trip_key := new.id;
  else trip_key := coalesce(new.trip_id, old.trip_id); end if;
  if not exists(select 1 from public.trips where id = trip_key) then return null; end if;
  select changes,stop_ids into previous,touched from public.trip_changes where trip_id = trip_key and transaction_id = txid_current() for update;
  touched := coalesce(touched,'{}');
  if tg_table_name = 'stops' then
    field := 'itinerary';
    stop_key := coalesce(new.id,old.id);
    select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]') into after_value from public.stops s where trip_id = trip_key;
    before_value := coalesce(previous->field->'before',after_value);
    if not stop_key = any(touched) then
      select coalesce(jsonb_agg(v order by v->>'id'), '[]') into before_value from (
        select v from jsonb_array_elements(before_value) v where v->>'id' <> stop_key::text
        union all select to_jsonb(old) where tg_op <> 'INSERT'
      ) rows;
      touched := array_append(touched,stop_key);
    end if;
    delta := jsonb_build_object(field, jsonb_build_object('before', before_value, 'after', after_value));
  elsif tg_table_name = 'trips' then
    before_value := jsonb_build_object('title', old.title, 'start_date', old.start_date);
    after_value := jsonb_build_object('title', new.title, 'start_date', new.start_date);
    delta := jsonb_build_object('trip', jsonb_build_object('before', before_value, 'after', after_value));
  else
    foreach field in array array['documents','expenseBudget','reservations','notificationSettings','predepartureChecklist'] loop
      before_value := old.data->field;
      after_value := new.data->field;
      if before_value is distinct from after_value then
        delta := delta || jsonb_build_object(field, jsonb_build_object('before', before_value, 'after', after_value));
      end if;
    end loop;
  end if;
  for field in select jsonb_object_keys(delta) loop
    if field <> 'itinerary' and previous ? field then
      delta := jsonb_set(delta, array[field,'before'], previous->field->'before');
    end if;
  end loop;
  delta := coalesce(previous, '{}') || delta;
  select coalesce(jsonb_object_agg(key,value), '{}') into delta from jsonb_each(delta)
    where value->'before' is distinct from value->'after';
  if delta = '{}'::jsonb then
    delete from public.trip_changes where trip_id = trip_key and transaction_id = txid_current();
  else
    insert into public.trip_changes(trip_id,changes,stop_ids) values(trip_key,delta,touched)
      on conflict(trip_id,transaction_id) do update set changes = excluded.changes,stop_ids = excluded.stop_ids;
  end if;
  return null;
end;
$$;

create or replace function public.revert_trip_change(p_trip uuid,p_change bigint,p_expected_latest bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare record public.trip_changes%rowtype; field text; current_value jsonb; target jsonb; after_value jsonb; archive jsonb; latest bigint;
begin
  if not public.airo_mcp_allowed(true) then raise exception '편집 권한이 필요합니다.' using errcode = '42501'; end if;
  perform 1 from public.trips where id = p_trip and user_id = auth.uid() for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,8));
  perform 1 from public.trip_archives where trip_id = p_trip for update;
  select max(id) into latest from public.trip_changes where trip_id = p_trip;
  if latest is distinct from p_expected_latest then raise exception '최신 변경 이력을 확인하세요.' using errcode = '40001'; end if;
  select * into record from public.trip_changes where trip_id = p_trip and id = p_change;
  if not found then raise exception '변경 이력을 찾을 수 없습니다.' using errcode = '42501'; end if;
  for field in select jsonb_object_keys(record.changes) loop
    target := record.changes->field->'before';
    after_value := record.changes->field->'after';
    if field = 'itinerary' then
      select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') into current_value from public.stops s where trip_id = p_trip;
    elsif field = 'trip' then
      select jsonb_build_object('title',title,'start_date',start_date) into current_value from public.trips where id = p_trip;
    else
      select data into archive from public.trip_archives where trip_id = p_trip;
      current_value := coalesce(archive->field,'null');
    end if;
    if field in ('expenseBudget','reservations','notificationSettings','predepartureChecklist') then
      if (case when jsonb_typeof(current_value) = 'object' then current_value - 'revision' else current_value end)
        is distinct from (case when jsonb_typeof(after_value) = 'object' then after_value - 'revision' else after_value end)
        then raise exception '이후 같은 자료가 변경됐습니다.' using errcode = '40001'; end if;
      -- Never roll a revision backwards: stale browser drafts must remain stale.
      if target = 'null'::jsonb then
        target := case field when 'expenseBudget' then '{"version":1,"reserve":0,"entries":[]}'::jsonb
          when 'predepartureChecklist' then '{"items":[]}'::jsonb
          when 'reservations' then '{"entries":[]}'::jsonb else '{"enabled":false,"timeZone":"Asia/Seoul","reminders":[]}'::jsonb end;
      end if;
      target := target || jsonb_build_object('revision',greatest(coalesce((current_value->>'revision')::integer,0),coalesce((target->>'revision')::integer,0),coalesce((after_value->>'revision')::integer,0))+1);
    elsif current_value is distinct from after_value then raise exception '이후 같은 자료가 변경됐습니다.' using errcode = '40001'; end if;
    if field = 'itinerary' then
      delete from public.stops where trip_id = p_trip;
      insert into public.stops select * from jsonb_populate_recordset(null::public.stops,target);
    elsif field = 'trip' then
      update public.trips set title = target->>'title',start_date = (target->>'start_date')::date where id = p_trip;
    else
      if target = 'null'::jsonb then archive := coalesce(archive,'{}') - field;
      else archive := jsonb_set(coalesce(archive,'{}'),array[field],target,true); end if;
      insert into public.trip_archives(trip_id,data) values(p_trip,archive) on conflict(trip_id) do update set data = excluded.data;
    end if;
  end loop;
  select max(id) into latest from public.trip_changes where trip_id = p_trip;
  return jsonb_build_object('revertedChangeId',p_change::text,'latestChangeId',latest::text);
end;
$$;


notify pgrst, 'reload schema';
