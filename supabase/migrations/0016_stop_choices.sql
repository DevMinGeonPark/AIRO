-- One numbered itinerary slot, several candidates, no implicit selection.
alter table public.stops add column choice jsonb;
create sequence public.stop_choice_revision_seq maxvalue 2147483645;
grant usage on sequence public.stop_choice_revision_seq to authenticated;
create function public.normalize_stop_choice() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare c jsonb; option jsonb; selected jsonb; ids text[] := '{}'; progress jsonb; key text;
begin
  if new.choice is null or new.choice='null'::jsonb then new.choice:=null; return new; end if;
  c := new.choice;
  if jsonb_typeof(c) is distinct from 'object' or octet_length(c::text)>50000
    or jsonb_typeof(c->'label') is distinct from 'string' or length(trim(c->>'label')) not between 1 and 100
    or coalesce(c->>'kind','') not in ('meal','visit','stay','other')
    or jsonb_typeof(c->'candidates') is distinct from 'array'
    or not c ? 'selectedId' or jsonb_typeof(c->'selectedId') not in ('null','string') then
    raise exception '선택형 일정 형식을 확인하세요.' using errcode='22023';
  end if;
  if jsonb_array_length(c->'candidates') not between 2 and 8 then raise exception '후보는 2~8곳입니다.' using errcode='22023'; end if;
  for option in select value from jsonb_array_elements(c->'candidates') loop
    if jsonb_typeof(option) is distinct from 'object' or jsonb_typeof(option->'id') is distinct from 'string'
      or coalesce(length(trim(option->>'id')),0) not between 1 and 128 or option->>'id'=any(ids)
      or jsonb_typeof(option->'name') is distinct from 'string' or coalesce(length(trim(option->>'name')),0) not between 1 and 300
      or jsonb_typeof(option->'lng') is distinct from 'number' or jsonb_typeof(option->'lat') is distinct from 'number'
      or coalesce(option->>'mode','') not in ('ground','flight')
      or (option->'note' is not null and jsonb_typeof(option->'note') not in ('string','null'))
      or (option->'map_query' is not null and jsonb_typeof(option->'map_query') not in ('string','null'))
      or coalesce(length(option->>'note'),0)>4000 or coalesce(length(option->>'map_query'),0)>500 then
      raise exception '후보 이름·ID·좌표를 확인하세요.' using errcode='22023';
    end if;
    if (option->>'lng')::numeric not between -180 and 180 or (option->>'lat')::numeric not between -90 and 90 then
      raise exception '후보 좌표를 확인하세요.' using errcode='22023'; end if;
    ids := array_append(ids,option->>'id');
    if option->>'id'=c->>'selectedId' then selected:=option; end if;
  end loop;
  if c->>'selectedId' is not null and selected is null then raise exception '없는 후보입니다.' using errcode='22023'; end if;
  if tg_op='UPDATE' and old.choice is not distinct from new.choice then
    if (new.name,new.lng,new.lat,new.mode,new.note,new.map_query) is distinct from (old.name,old.lng,old.lat,old.mode,old.note,old.map_query) then
      raise exception '선택형 장소는 후보 설정 또는 후보 선택으로 변경하세요.' using errcode='22023'; end if;
    return new;
  end if;
  new.choice:=jsonb_set(c,'{revision}',to_jsonb(nextval('public.stop_choice_revision_seq')));
  -- Placeholder coordinates are only for framing. Clients must not route/complete an unresolved slot.
  option:=coalesce(selected,c->'candidates'->0);
  new.name:=case when selected is null then c->>'label' else selected->>'name' end;
  new.lng:=(option->>'lng')::float8; new.lat:=(option->>'lat')::float8;
  new.mode:=case when selected is null then 'ground' else selected->>'mode' end;
  new.note:=selected->>'note'; new.map_query:=selected->>'map_query';
  if tg_op='UPDATE' then
    perform pg_advisory_xact_lock(hashtextextended(new.trip_id::text,8));
    select data->'itineraryProgress' into progress from public.trip_archives where trip_id=new.trip_id for update;
    key:=coalesce(nullif(new.source_id,''),new.id::text);
    if progress is not null and exists(select 1 from jsonb_array_elements(progress->'entries') e where e->>'stopId' in (key,new.id::text)) then
      progress:=jsonb_set(progress,'{entries}',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(progress->'entries') e where e->>'stopId' not in (key,new.id::text)));
      progress:=jsonb_set(progress,'{revision}',to_jsonb((progress->>'revision')::int+1));
      update public.trip_archives set data=jsonb_set(data,'{itineraryProgress}',progress) where trip_id=new.trip_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_stop_choice() from public,anon,authenticated;
create trigger normalize_stop_choice before insert or update on public.stops for each row execute function public.normalize_stop_choice();

create function public.mutate_stop_choice(p_trip uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare s public.stops%rowtype; result jsonb; new_choice jsonb; payload jsonb; option jsonb;
  envelope jsonb:=jsonb_build_object('tripId',p_trip,'operation','choice:'||p_action,'input',p_input);
  receipt public.mutation_receipts%rowtype; choice_request_id text:=p_input->>'requestId';
begin
  if not public.airo_mcp_allowed(true) then raise exception '편집 권한이 필요합니다.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('add','configure','select') or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>60000 then
    raise exception '선택형 일정 요청을 확인하세요.' using errcode='22023'; end if;
  if p_action='add' then
    if choice_request_id is null or length(choice_request_id) not between 8 and 120 then raise exception 'requestId를 지정하세요.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mutation:'||auth.uid()::text||':'||choice_request_id,0));
  end if;
  perform 1 from public.trips where id=p_trip and user_id=auth.uid() for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode='42501'; end if;
  if p_action='add' then
    select r.* into receipt from public.mutation_receipts r where r.user_id=auth.uid() and r.request_id=choice_request_id;
    if found then
      if receipt.payload<>envelope then raise exception '같은 requestId에 다른 내용을 보낼 수 없습니다.' using errcode='22023'; end if;
      return receipt.result;
    end if;
  else
    select * into s from public.stops where trip_id=p_trip and id=(p_input->>'stopId')::uuid for update;
    if not found then raise exception '일정을 찾을 수 없습니다.' using errcode='42501'; end if;
    if jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')::numeric<>coalesce((s.choice->>'revision')::numeric,0) then
      raise exception '최신 후보를 다시 확인하세요.' using errcode='40001'; end if;
  end if;
  if p_action='select' then
    if s.choice is null or not p_input ? 'candidateId' or jsonb_typeof(p_input->'candidateId') not in ('null','string') then
      raise exception '후보를 확인하세요.' using errcode='22023'; end if;
    new_choice:=jsonb_set(s.choice,'{selectedId}',p_input->'candidateId');
    if new_choice=s.choice then return to_jsonb(s); end if;
  else
    new_choice:=jsonb_build_object('label',p_input->'label','kind',p_input->'kind','candidates',p_input->'candidates','selectedId',null,'revision',0);
  end if;
  if p_action='add' then
    option:=new_choice->'candidates'->0;
    if p_input->>'time' is not null and p_input->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '시간은 HH:mm입니다.' using errcode='22023'; end if;
    payload:=p_input-'requestId'-'label'-'kind'-'candidates'||jsonb_build_object('name',p_input->>'label','lng',option->'lng','lat',option->'lat');
    result:=public.mutate_itinerary(p_trip,'add',payload,null);
    select * into s from public.stops where id=(result->'stop'->>'id')::uuid;
  end if;
  update public.stops set choice=new_choice where id=s.id and trip_id=p_trip returning * into s;
  result:=to_jsonb(s);
  if p_action='add' then insert into public.mutation_receipts(user_id,request_id,payload,result) values(auth.uid(),choice_request_id,envelope,result); end if;
  return result;
end;
$$;
revoke all on function public.mutate_stop_choice(uuid,text,jsonb) from public,anon;
grant execute on function public.mutate_stop_choice(uuid,text,jsonb) to authenticated;

-- Preserve candidates through export/import and skip unresolved automatic completion.
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

  insert into public.stops(trip_id, source_id, name, lng, lat, day, position, time, note, map_query, mode, date, choice)
  select new_trip, s.source_id, s.name, s.lng, s.lat, s.day, coalesce(s.position, (a.n - 1)::int),
    s.time, s.note, s.map_query, coalesce(s.mode, 'ground'), s.date, s.choice
  from jsonb_array_elements(p_archive->'stops') with ordinality as a(value, n)
  cross join lateral jsonb_to_record(a.value) as s(
    source_id text, name text, lng float8, lat float8, day int, position int,
    time text, note text, map_query text, mode text, date text, choice jsonb);

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

create or replace function public.mutate_trip_progress(p_trip uuid, p_action jsonb, p_revision integer) returns jsonb
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
    if action='manual' and p_action->>'done'='true' and selected.choice is not null and selected.choice->>'selectedId' is null then raise exception '후보를 먼저 선택하세요.' using errcode='22023'; end if;
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
        and (s.choice is null or s.choice->>'selectedId' is not null)
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
      select coalesce(jsonb_agg(jsonb_build_object('choice',null)||v order by v->>'id'),'[]') into target from jsonb_array_elements(target) v;
      select coalesce(jsonb_agg(jsonb_build_object('choice',null)||v order by v->>'id'),'[]') into after_value from jsonb_array_elements(after_value) v;
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
