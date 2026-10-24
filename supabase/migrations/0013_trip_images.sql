-- Private QR/photo originals live with their account-owned travel archive.
create function public.attach_trip_image(p_trip uuid, p_image jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_data jsonb; images jsonb; existing jsonb; raw bytea;
begin
  if not public.airo_mcp_allowed(true) then raise exception '편집 권한이 필요합니다.' using errcode = '42501'; end if;
  perform 1 from public.trips where id = p_trip and user_id = auth.uid() for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_image) is distinct from 'object'
    or jsonb_typeof(p_image->'base64') is distinct from 'string'
    or jsonb_typeof(p_image->'name') is distinct from 'string'
    or coalesce(length(trim(p_image->>'name')),0) not between 1 and 200
    or coalesce(p_image->>'mime','') not in ('image/png','image/jpeg')
    or coalesce(p_image->>'sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_image->>'base64','') !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    or length(p_image->>'base64') > 2796204
    or coalesce(p_image->>'sourceUrl','') !~ '^https://[^/@[:space:]]+([/?#]|$)'
    or length(p_image->>'sourceUrl') > 2048
    or coalesce(p_image->>'capturedAt','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$'
    or jsonb_typeof(p_image->'width') is distinct from 'number'
    or jsonb_typeof(p_image->'height') is distinct from 'number' then
    raise exception '이미지 형식을 확인하세요.' using errcode = '22023';
  end if;
  if (p_image->>'width')::numeric not between 1 and 4096 or (p_image->>'height')::numeric not between 1 and 4096 then
    raise exception '이미지 크기를 확인하세요.' using errcode = '22023';
  end if;
  perform (p_image->>'capturedAt')::timestamptz;
  raw := decode(p_image->>'base64','base64');
  if octet_length(raw) not between 24 and 2097152
    or (p_image->>'mime' = 'image/png' and substring(raw from 1 for 8) <> decode('89504e470d0a1a0a','hex'))
    or (p_image->>'mime' = 'image/jpeg' and substring(raw from 1 for 3) <> decode('ffd8ff','hex'))
    or p_image->>'sha256' is distinct from encode(sha256(raw),'hex') then
    raise exception '이미지 원본·크기·해시를 확인하세요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,8));
  insert into public.trip_archives(trip_id,data) values(p_trip,'{}') on conflict do nothing;
  select data into current_data from public.trip_archives where trip_id = p_trip for update;
  images := coalesce(current_data->'images','[]');
  select item into existing from jsonb_array_elements(images) item where item->>'sha256' = p_image->>'sha256' limit 1;
  if found then return existing - 'base64'; end if;
  if jsonb_array_length(images) >= 10 then raise exception '이미지는 최대 10개입니다.' using errcode = '22023'; end if;
  current_data := jsonb_set(current_data,'{images}',images || jsonb_build_array(p_image),true);
  if octet_length(current_data::text) > 8388608 then raise exception '보관 자료는 최대 8 MiB입니다.' using errcode = '22023'; end if;
  update public.trip_archives set data = current_data where trip_id = p_trip;
  return p_image - 'base64';
end;
$$;

create function public.list_trip_images(p_trip uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select coalesce((select jsonb_agg(image - 'base64') from public.trip_archives a,
    lateral jsonb_array_elements(coalesce(a.data->'images','[]')) image where a.trip_id = p_trip),'[]');
$$;
revoke all on function public.attach_trip_image(uuid,jsonb),public.list_trip_images(uuid) from public,anon;
grant execute on function public.attach_trip_image(uuid,jsonb),public.list_trip_images(uuid) to authenticated;

-- History exposes image metadata, never the original QR bytes.
create or replace function public.get_trip_change(p_trip uuid,p_change bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare row public.trip_changes%rowtype; field text; side text; documents jsonb;
begin
  select * into row from public.trip_changes where trip_id = p_trip and id = p_change;
  if not found then raise exception '변경 이력을 찾을 수 없습니다.' using errcode = '42501'; end if;
  foreach field in array array['documents','images'] loop
    if row.changes ? field then
      foreach side in array array['before','after'] loop
        if jsonb_typeof(row.changes->field->side) = 'array' then
          select coalesce(jsonb_agg(d - 'base64'),'[]') into documents from jsonb_array_elements(row.changes->field->side) d;
          row.changes := jsonb_set(row.changes,array[field,side],documents);
        end if;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('id',row.id::text,'created_at',row.created_at,'changes',row.changes);
end;
$$;

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
    foreach field in array array['documents','expenseBudget','reservations','notificationSettings','predepartureChecklist','images'] loop
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


notify pgrst, 'reload schema';
