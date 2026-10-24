-- Link existing PDFs and reservations to place cards; keep existing tool contracts compatible.
create or replace function public.attach_trip_document(p_trip uuid, p_document jsonb) returns jsonb
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
  if p_document ? 'stopIds' then
    if jsonb_typeof(p_document->'stopIds') is distinct from 'array' then raise exception '장소 ID 목록이 필요합니다.' using errcode = '22023'; end if;
    if jsonb_array_length(p_document->'stopIds') > 100 or exists(
      select 1 from jsonb_array_elements(p_document->'stopIds') v
      where jsonb_typeof(v) <> 'string' or not exists(select 1 from public.stops s where s.trip_id = p_trip and (s.id::text = v#>>'{}' or s.source_id = v#>>'{}'))
    ) then raise exception '이 여행의 장소 ID를 지정하세요.' using errcode = '22023'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,8));
  insert into public.trip_archives(trip_id,data) values(p_trip,'{}') on conflict do nothing;
  select data into current_data from public.trip_archives where trip_id = p_trip for update;
  documents := coalesce(current_data->'documents','[]');
  select doc into existing from jsonb_array_elements(documents) doc where doc->>'sha256' = p_document->>'sha256' limit 1;
  if found then
    if p_document ? 'stopIds' and existing->'stopIds' is distinct from p_document->'stopIds' then
      existing := existing || jsonb_build_object('stopIds',p_document->'stopIds');
      select jsonb_agg(case when doc->>'sha256' = existing->>'sha256' then existing else doc end order by n) into documents
        from jsonb_array_elements(documents) with ordinality as docs(doc,n);
      current_data := jsonb_set(current_data,'{documents}',documents,true);
      if octet_length(current_data::text) > 8388608 then raise exception '보관 자료는 최대 8 MiB입니다.' using errcode = '22023'; end if;
      update public.trip_archives set data = current_data where trip_id = p_trip;
    end if;
    return existing;
  end if;
  if jsonb_array_length(documents) >= 20 then raise exception 'PDF는 최대 20개까지 첨부할 수 있습니다.' using errcode = '22023'; end if;
  current_data := jsonb_set(current_data,'{documents}',documents || jsonb_build_array(p_document),true);
  if octet_length(current_data::text) > 8388608 then raise exception '보관 자료는 최대 8 MiB입니다.' using errcode = '22023'; end if;
  update public.trip_archives set data = current_data where trip_id = p_trip;
  return p_document;
end;
$$;

create or replace function public.set_trip_management(p_trip uuid,p_field text,p_value jsonb,p_revision integer) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_data jsonb; current_revision integer; result jsonb; entries jsonb; entry jsonb;
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
      or (e->>'stopId' is not null and not exists(select 1 from public.stops s where s.trip_id = p_trip and (s.id::text = e->>'stopId' or s.source_id = e->>'stopId'))))
      or (select count(*) <> count(distinct e->>'id') from jsonb_array_elements(entries) e) then
      raise exception '예약 항목을 확인하세요.' using errcode = '22023';
    end if;
    for entry in select value from jsonb_array_elements(entries) loop
      if entry ? 'bookingUrl' and entry->'bookingUrl' <> 'null'::jsonb and
        (jsonb_typeof(entry->'bookingUrl') <> 'string' or length(entry->>'bookingUrl') > 2048
        or entry->>'bookingUrl' !~ '^https://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$') then
        raise exception '예약 페이지의 HTTPS 주소를 입력하세요.' using errcode = '22023';
      end if;
      if entry ? 'stopIds' then
        if jsonb_typeof(entry->'stopIds') is distinct from 'array' then raise exception '장소 ID 목록이 필요합니다.' using errcode = '22023'; end if;
        if jsonb_array_length(entry->'stopIds') > 100 or exists(select 1 from jsonb_array_elements(entry->'stopIds') v where
          jsonb_typeof(v) <> 'string' or not exists(select 1 from public.stops s where s.trip_id = p_trip and (s.id::text = v#>>'{}' or s.source_id = v#>>'{}')))
          then raise exception '이 여행의 장소 ID를 지정하세요.' using errcode = '22023'; end if;
      end if;
      if entry ? 'documentSha256s' then
        if jsonb_typeof(entry->'documentSha256s') is distinct from 'array' then raise exception 'PDF 해시 목록이 필요합니다.' using errcode = '22023'; end if;
        if jsonb_array_length(entry->'documentSha256s') > 20 or exists(select 1 from jsonb_array_elements(entry->'documentSha256s') v where
          jsonb_typeof(v) <> 'string' or not exists(select 1 from public.trip_archives a, jsonb_array_elements(coalesce(a.data->'documents','[]')) d where a.trip_id = p_trip and d->>'sha256' = v#>>'{}'))
          then raise exception '이 여행에 첨부된 PDF 해시를 지정하세요.' using errcode = '22023'; end if;
      end if;
    end loop;
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

create function public.get_trip_attachments(p_trip uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'documents',coalesce((select jsonb_agg(d - 'base64' order by n) from public.trip_archives a,
      jsonb_array_elements(coalesce(a.data->'documents','[]')) with ordinality as docs(d,n) where a.trip_id = p_trip),'[]'),
    'reservations',coalesce((select a.data->'reservations'->'entries' from public.trip_archives a where a.trip_id = p_trip),'[]')
  );
$$;
revoke all on function public.get_trip_attachments(uuid) from public,anon;
grant execute on function public.get_trip_attachments(uuid) to authenticated;
notify pgrst, 'reload schema';
