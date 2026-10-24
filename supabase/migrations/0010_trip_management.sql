-- Account-owned MCP document, reservation, notification and audit operations.
-- No external providers, delivery workers or paid services are enabled here.
create table public.trip_changes (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  transaction_id bigint not null default txid_current(),
  changes jsonb not null,
  stop_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (trip_id, transaction_id)
);
create index trip_changes_page on public.trip_changes(trip_id, id desc);
alter table public.trip_changes enable row level security;
revoke all on public.trip_changes from public, anon, authenticated;
grant select on public.trip_changes to authenticated;
create policy trip_changes_read on public.trip_changes for select to authenticated using (
  public.airo_mcp_allowed(false) and exists(select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
);

-- Only triggers can append audit records. Multiple reordered rows in one RPC
-- become one before/after itinerary, never an intermediate partial ordering.
create function public.record_trip_change() returns trigger
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
    foreach field in array array['documents','expenseBudget','reservations','notificationSettings'] loop
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
revoke all on function public.record_trip_change() from public, anon, authenticated;
create trigger record_trip_info after update on public.trips for each row execute function public.record_trip_change();
create trigger record_trip_stops after insert or update or delete on public.stops for each row execute function public.record_trip_change();
create trigger record_trip_archive after insert or update or delete on public.trip_archives for each row execute function public.record_trip_change();

create function public.attach_trip_document(p_trip uuid, p_document jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_data jsonb; documents jsonb; existing jsonb; raw bytea;
begin
  if not public.airo_mcp_allowed(true) then raise exception '편집 권한이 필요합니다.' using errcode = '42501'; end if;
  perform 1 from public.trips where id = p_trip and user_id = auth.uid() for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_document) is distinct from 'object' or p_document->>'mime' is distinct from 'application/pdf'
    or jsonb_typeof(p_document->'base64') is distinct from 'string' or jsonb_typeof(p_document->'sha256') is distinct from 'string'
    or jsonb_typeof(p_document->'name') is distinct from 'string'
    or coalesce(length(trim(p_document->>'name')),0) not between 1 and 300
    or coalesce(p_document->>'name','') !~* '\.pdf$'
    or coalesce(p_document->>'base64','') !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    or length(p_document->>'base64') > 2796204 then raise exception 'PDF 형식이 올바르지 않습니다.' using errcode = '22023'; end if;
  raw := decode(p_document->>'base64','base64');
  if octet_length(raw) > 2097152 or substring(raw from 1 for 5) <> convert_to('%PDF-','UTF8')
    or position(convert_to('%%EOF','UTF8') in substring(raw from greatest(1,octet_length(raw)-1023))) = 0
    or p_document->>'sha256' is distinct from encode(sha256(raw),'hex') then
    raise exception 'PDF 크기·내용·해시를 확인하세요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,8));
  insert into public.trip_archives(trip_id,data) values(p_trip,'{}') on conflict do nothing;
  select data into current_data from public.trip_archives where trip_id = p_trip for update;
  documents := coalesce(current_data->'documents','[]');
  select doc into existing from jsonb_array_elements(documents) doc where doc->>'sha256' = p_document->>'sha256' limit 1;
  if found then return existing; end if;
  if jsonb_array_length(documents) >= 20 then raise exception 'PDF는 최대 20개까지 첨부할 수 있습니다.' using errcode = '22023'; end if;
  current_data := jsonb_set(current_data,'{documents}',documents || jsonb_build_array(p_document),true);
  if octet_length(current_data::text) > 8388608 then raise exception '보관 자료는 최대 8 MiB입니다.' using errcode = '22023'; end if;
  update public.trip_archives set data = current_data where trip_id = p_trip;
  return p_document;
end;
$$;

create function public.set_trip_management(p_trip uuid,p_field text,p_value jsonb,p_revision integer) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_data jsonb; current_revision integer; result jsonb; entries jsonb;
begin
  if not public.airo_mcp_allowed(true) then raise exception '편집 권한이 필요합니다.' using errcode = '42501'; end if;
  perform 1 from public.trips where id = p_trip and user_id = auth.uid() for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;
  if p_field is null or p_field not in ('reservations','notificationSettings') or jsonb_typeof(p_value) is distinct from 'object'
    or p_revision is null or p_revision not between 0 and 2147483645 or octet_length(p_value::text) > 262144 then
    raise exception '설정 형식을 확인하세요.' using errcode = '22023';
  end if;
  if p_field = 'reservations' then
    entries := p_value->'entries';
    if jsonb_typeof(entries) is distinct from 'array' then raise exception '예약 목록이 필요합니다.' using errcode = '22023'; end if;
    if jsonb_array_length(entries) > 500 or exists(select 1 from jsonb_array_elements(entries) e where
      coalesce(e->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(length(trim(e->>'name')),0) not between 1 and 200
      or coalesce(e->>'bookingStatus','') not in ('not_booked','pending','confirmed','cancelled')
      or coalesce(e->>'paymentStatus','') not in ('unpaid','partial','paid','refunded')
      or length(e->>'reference') > 300 or length(e->>'note') > 4000
      or (e->>'stopId' is not null and not exists(select 1 from public.stops s where s.trip_id = p_trip and s.id::text = e->>'stopId')))
      or (select count(*) <> count(distinct e->>'id') from jsonb_array_elements(entries) e) then
      raise exception '예약 항목을 확인하세요.' using errcode = '22023';
    end if;
  else
    entries := p_value->'reminders';
    if jsonb_typeof(entries) is distinct from 'array' or jsonb_typeof(p_value->'enabled') is distinct from 'boolean'
      or not exists(select 1 from pg_timezone_names where name = p_value->>'timeZone') then
      raise exception '알림 목록·시간대를 확인하세요.' using errcode = '22023';
    end if;
    if jsonb_array_length(entries) > 100 or exists(select 1 from jsonb_array_elements(entries) e where
      coalesce(e->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(length(trim(e->>'title')),0) not between 1 and 200
      or jsonb_typeof(e->'enabled') is distinct from 'boolean'
      or coalesce(e->>'at','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$')
      or (select count(*) <> count(distinct e->>'id') from jsonb_array_elements(entries) e) then
      raise exception '알림 항목을 확인하세요.' using errcode = '22023';
    end if;
    perform (e->>'at')::timestamptz from jsonb_array_elements(entries) e;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,8));
  insert into public.trip_archives(trip_id,data) values(p_trip,'{}') on conflict do nothing;
  select data into current_data from public.trip_archives where trip_id = p_trip for update;
  current_revision := coalesce((current_data->p_field->>'revision')::integer,0);
  if current_revision <> p_revision then raise exception '자료가 변경됐습니다.' using errcode = '40001'; end if;
  result := p_value || jsonb_build_object('revision', current_revision + 1);
  update public.trip_archives set data = jsonb_set(current_data,array[p_field],result,true) where trip_id = p_trip;
  return result;
end;
$$;

create function public.list_trip_changes(p_trip uuid,p_before bigint default null,p_limit integer default 20) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('changes',coalesce(jsonb_agg(row_to_json(page) order by page.id::bigint desc),'[]')) from (
    select id::text,created_at,array(select jsonb_object_keys(changes)) as fields
    from public.trip_changes where trip_id = p_trip and (p_before is null or id < p_before)
    order by public.trip_changes.id desc limit greatest(1,least(coalesce(p_limit,20),50))
  ) page;
$$;
create function public.get_trip_change(p_trip uuid,p_change bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare row public.trip_changes%rowtype; side text; docs jsonb;
begin
  select * into row from public.trip_changes where trip_id = p_trip and id = p_change;
  if not found then raise exception '변경 이력을 찾을 수 없습니다.' using errcode = '42501'; end if;
  if row.changes ? 'documents' then
    foreach side in array array['before','after'] loop
      if jsonb_typeof(row.changes->'documents'->side) = 'array' then
        select coalesce(jsonb_agg(d - 'base64'),'[]') into docs from jsonb_array_elements(row.changes->'documents'->side) d;
        row.changes := jsonb_set(row.changes,array['documents',side],docs);
      end if;
    end loop;
  end if;
  return jsonb_build_object('id',row.id::text,'created_at',row.created_at,'changes',row.changes);
end;
$$;

create function public.revert_trip_change(p_trip uuid,p_change bigint,p_expected_latest bigint) returns jsonb
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
    if field in ('expenseBudget','reservations','notificationSettings') then
      if (case when jsonb_typeof(current_value) = 'object' then current_value - 'revision' else current_value end)
        is distinct from (case when jsonb_typeof(after_value) = 'object' then after_value - 'revision' else after_value end)
        then raise exception '이후 같은 자료가 변경됐습니다.' using errcode = '40001'; end if;
      -- Never roll a revision backwards: stale browser drafts must remain stale.
      if target = 'null'::jsonb then
        target := case field when 'expenseBudget' then '{"version":1,"reserve":0,"entries":[]}'::jsonb
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

revoke all on function public.attach_trip_document(uuid,jsonb), public.set_trip_management(uuid,text,jsonb,integer),
  public.list_trip_changes(uuid,bigint,integer),public.get_trip_change(uuid,bigint),public.revert_trip_change(uuid,bigint,bigint) from public,anon;
grant execute on function public.attach_trip_document(uuid,jsonb), public.set_trip_management(uuid,text,jsonb,integer),
  public.list_trip_changes(uuid,bigint,integer),public.get_trip_change(uuid,bigint),public.revert_trip_change(uuid,bigint,bigint) to authenticated;
notify pgrst, 'reload schema';
