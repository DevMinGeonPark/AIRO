-- Owner-scoped itinerary completion. Location samples are evaluated, never stored.
create function public.mutate_trip_progress(p_trip uuid, p_action jsonb, p_revision integer) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  archive jsonb; value jsonb; original jsonb; entries jsonb; rules jsonb; entry jsonb; rule jsonb;
  action text; key text; mode text; start_date date; selected public.stops%rowtype; candidate record;
  stamp timestamptz := clock_timestamp(); local_now timestamp; checked_by text; radius numeric;
  position jsonb; good_position boolean := false; latitude double precision; longitude double precision; accuracy double precision; age double precision; distance double precision;
begin
  if not public.airo_mcp_allowed(true) then raise exception '편집 권한이 필요합니다.' using errcode='42501'; end if;
  select t.start_date into start_date from public.trips t where t.id=p_trip and t.user_id=auth.uid() for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode='42501'; end if;
  action := p_action->>'action';
  if jsonb_typeof(p_action) is distinct from 'object' or action is null or action not in ('manual','resume','rule','timezone','automatic')
    or p_revision is null or p_revision not between 0 and 2147483645 or octet_length(p_action::text)>8192 then
    raise exception '진행 요청을 확인하세요.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,8));
  insert into public.trip_archives(trip_id,data) values(p_trip,'{}') on conflict do nothing;
  select data into archive from public.trip_archives where trip_id=p_trip for update;
  value := coalesce(archive->'itineraryProgress','{"revision":0,"timeZone":"Asia/Seoul","rules":[],"entries":[]}');
  if (value->>'revision')::integer<>p_revision then raise exception '진행 상태가 변경됐습니다.' using errcode='40001'; end if;
  original:=value; entries:=value->'entries'; rules:=value->'rules';
  if action in ('manual','resume','rule') then
    key := case when action='rule' then p_action->'rule'->>'stopId' else p_action->>'stopId' end;
    select * into selected from public.stops s where s.trip_id=p_trip and (s.id::text=key or s.source_id=key) limit 1;
    if not found then raise exception '이 여행의 일정을 선택하세요.' using errcode='42501'; end if;
    key:=coalesce(nullif(selected.source_id,''),selected.id::text);
    if action in ('manual','resume') then
      select coalesce(jsonb_agg(e),'[]') into entries from jsonb_array_elements(entries) e where e->>'stopId' not in (key,selected.id::text);
      if action='manual' then
        if jsonb_typeof(p_action->'done') is distinct from 'boolean' then raise exception '완료 여부를 확인하세요.' using errcode='22023'; end if;
        entries:=entries||jsonb_build_array(jsonb_build_object('stopId',key,'done',p_action->'done','source','manual',
          'completedAt',case when (p_action->>'done')::boolean then to_jsonb(stamp) else 'null'::jsonb end,'updatedAt',stamp));
      end if;
      value:=jsonb_set(value,'{entries}',entries);
    else
      rule:=p_action->'rule'; mode:=rule->>'mode';
      if jsonb_typeof(rule) is distinct from 'object' or mode is null or mode not in ('manual','location','time','either') or jsonb_typeof(rule->'radiusMeters') is distinct from 'number' then
        raise exception '자동 체크 조건을 확인하세요.' using errcode='22023';
      end if;
      radius:=(rule->>'radiusMeters')::numeric;
      if radius not between 100 and 1000 or radius<>trunc(radius) or (mode<>'manual' and start_date is null)
        or (mode in ('time','either') and coalesce(selected.time,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
        raise exception '시작일과 일정 시간을 확인하세요.' using errcode='22023';
      end if;
      select coalesce(jsonb_agg(r),'[]') into rules from jsonb_array_elements(rules) r where r->>'stopId' not in (key,selected.id::text);
      if mode<>'manual' then rules:=rules||jsonb_build_array(jsonb_build_object('stopId',key,'mode',mode,'radiusMeters',radius)); end if;
      value:=jsonb_set(value,'{rules}',rules);
    end if;
  elsif action='timezone' then
    if jsonb_typeof(p_action->'timeZone') is distinct from 'string' or not exists(select 1 from pg_timezone_names where name=p_action->>'timeZone') then
      raise exception '시간대를 확인하세요.' using errcode='22023';
    end if;
    value:=jsonb_set(value,'{timeZone}',p_action->'timeZone');
  elsif start_date is not null then
    local_now:=stamp at time zone (value->>'timeZone');
    position:=p_action->'position';
    if position is not null then
      if jsonb_typeof(position) is distinct from 'object' or jsonb_typeof(position->'lat') is distinct from 'number'
        or jsonb_typeof(position->'lng') is distinct from 'number' or jsonb_typeof(position->'accuracy') is distinct from 'number'
        or jsonb_typeof(position->'timestamp') is distinct from 'number' then raise exception '위치 형식을 확인하세요.' using errcode='22023'; end if;
      latitude:=(position->>'lat')::double precision; longitude:=(position->>'lng')::double precision; accuracy:=(position->>'accuracy')::double precision;
      age:=extract(epoch from stamp)*1000-(position->>'timestamp')::double precision;
      good_position:=latitude between -90 and 90 and longitude between -180 and 180 and accuracy between 0 and 100 and age between -10000 and 60000;
    end if;
    for candidate in
      select s.*,r->>'mode' as check_mode,(r->>'radiusMeters')::numeric as check_radius
      from public.stops s join jsonb_array_elements(rules) r on r->>'stopId' in (s.id::text,s.source_id)
      where s.trip_id=p_trip and start_date+s.day-1=local_now::date
        and not exists(select 1 from jsonb_array_elements(entries) e where e->>'stopId' in (s.id::text,s.source_id))
      order by s.position,s.id
    loop
      checked_by:=null;
      if candidate.check_mode in ('location','either') and good_position then
        distance:=12742000*asin(sqrt(least(1::double precision,greatest(0::double precision,
          power(sin(radians(candidate.lat-latitude)/2),2)+cos(radians(latitude))*cos(radians(candidate.lat))*power(sin(radians(candidate.lng-longitude)/2),2)))));
        if distance+accuracy<=candidate.check_radius then checked_by:='location'; end if;
      end if;
      if checked_by is null and candidate.check_mode in ('time','either') then
        if (case when candidate.time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then candidate.time::time<=local_now::time else false end) then checked_by:='time'; end if;
      end if;
      if checked_by is not null then
        entries:=entries||jsonb_build_array(jsonb_build_object('stopId',coalesce(nullif(candidate.source_id,''),candidate.id::text),'done',true,'source',checked_by,'completedAt',stamp,'updatedAt',stamp));
      end if;
    end loop;
    value:=jsonb_set(value,'{entries}',entries);
  end if;
  if value=original then return value; end if;
  if jsonb_array_length(value->'entries')>10000 or jsonb_array_length(value->'rules')>10000 then raise exception '진행 항목 한도를 초과했습니다.' using errcode='22023'; end if;
  value:=jsonb_set(value,'{revision}',to_jsonb(p_revision+1));
  archive:=jsonb_set(archive,'{itineraryProgress}',value,true);
  if octet_length(archive::text)>8388608 then raise exception '보관 자료 한도를 초과했습니다.' using errcode='22023'; end if;
  update public.trip_archives set data=archive where trip_id=p_trip;
  return value;
end;
$$;
revoke all on function public.mutate_trip_progress(uuid,jsonb,integer) from public,anon;
grant execute on function public.mutate_trip_progress(uuid,jsonb,integer) to authenticated;

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
    foreach field in array array['documents','expenseBudget','reservations','notificationSettings','predepartureChecklist','images','itineraryProgress'] loop
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
    if field in ('expenseBudget','reservations','notificationSettings','predepartureChecklist','itineraryProgress') then
      if (case when jsonb_typeof(current_value) = 'object' then current_value - 'revision' else current_value end)
        is distinct from (case when jsonb_typeof(after_value) = 'object' then after_value - 'revision' else after_value end)
        then raise exception '이후 같은 자료가 변경됐습니다.' using errcode = '40001'; end if;
      -- Never roll a revision backwards: stale browser drafts must remain stale.
      if target = 'null'::jsonb then
        target := case field when 'expenseBudget' then '{"version":1,"reserve":0,"entries":[]}'::jsonb
          when 'itineraryProgress' then '{"timeZone":"Asia/Seoul","rules":[],"entries":[]}'::jsonb
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
