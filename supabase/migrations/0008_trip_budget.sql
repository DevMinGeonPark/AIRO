-- Editable account budgets share the archive so exports/imports preserve them.
-- Only this field changes; documents, routes, photos and earlier budgets remain.
create or replace function public.update_trip_budget(p_trip uuid, p_budget jsonb, p_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_data jsonb;
  current_revision integer;
  result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.trips where id = p_trip and user_id = auth.uid()) then
    raise exception '여행을 찾을 수 없습니다.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_budget) is distinct from 'object' or p_budget->>'version' is distinct from '1'
    or jsonb_typeof(p_budget->'entries') is distinct from 'array'
    or jsonb_typeof(p_budget->'reserve') is distinct from 'number'
    or octet_length(p_budget::text) > 262144 or p_revision is null or p_revision < 0 then
    raise exception '예산 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_budget->'entries') > 500
    or (p_budget->>'reserve')::numeric not between 0 and 1000000000000 then
    raise exception '예산 한도를 확인해 주세요.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_budget->'entries') e where
    jsonb_typeof(e) is distinct from 'object'
    or jsonb_typeof(e->'id') is distinct from 'string'
    or coalesce(e->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(e->'name') is distinct from 'string' or length(trim(e->>'name')) not between 1 and 200
    or coalesce(e->>'category', '') not in ('flight','stay','food','transport','activity','shopping','other')
    or coalesce(e->>'currency', '') not in ('KRW','JPY','USD','EUR','GBP','CNY','TWD','THB','VND','SGD','AUD','CAD')
    or jsonb_typeof(e->'amount') is distinct from 'number'
    or jsonb_typeof(e->'exchangeRate') is distinct from 'number'
    or jsonb_typeof(e->'paid') is distinct from 'boolean'
    or not (e ? 'day') or jsonb_typeof(e->'day') not in ('number', 'null')) then
    raise exception '예산 항목의 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_budget->'entries') e where
    (e->>'amount')::numeric not between 0 and 1000000000000
    or (e->>'exchangeRate')::numeric <= 0 or (e->>'exchangeRate')::numeric > 1000000
    or (e->>'amount')::numeric * (e->>'exchangeRate')::numeric > 1000000000000
    or (e->>'currency' = 'KRW' and (e->>'exchangeRate')::numeric <> 1)
    or (e->>'day' is not null and ((e->>'day')::numeric not between 0 and 3650 or (e->>'day')::numeric <> trunc((e->>'day')::numeric))))
    or (select count(*) <> count(distinct e->>'id') from jsonb_array_elements(p_budget->'entries') e) then
    raise exception '금액·일차·환율 또는 중복 항목을 확인해 주세요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text, 8));
  insert into public.trip_archives(trip_id, data) values(p_trip, '{}'::jsonb) on conflict do nothing;
  select data into current_data from public.trip_archives where trip_id = p_trip for update;
  current_revision := coalesce((current_data->'expenseBudget'->>'revision')::integer, 0);
  if current_revision <> p_revision then
    raise exception '다른 창에서 예산이 변경되었습니다.' using errcode = '40001';
  end if;
  result := jsonb_build_object('version', 1, 'revision', current_revision + 1, 'reserve', p_budget->'reserve', 'entries', p_budget->'entries');
  update public.trip_archives set data = jsonb_set(current_data, '{expenseBudget}', result, true) where trip_id = p_trip;
  return result;
end;
$$;
revoke all on function public.update_trip_budget(uuid, jsonb, integer) from public, anon;
grant execute on function public.update_trip_budget(uuid, jsonb, integer) to authenticated;

-- New users can keep discovered places without a personal-data import.
create or replace function public.save_trip_place(p_trip uuid, p_place jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_data jsonb;
  places jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.trips where id = p_trip and user_id = auth.uid()) then
    raise exception '여행을 찾을 수 없습니다.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_place) is distinct from 'object' or octet_length(p_place::text) > 16384
    or jsonb_typeof(p_place->'id') is distinct from 'string' or length(p_place->>'id') not between 1 and 200
    or jsonb_typeof(p_place->'name') is distinct from 'string' or length(trim(p_place->>'name')) not between 1 and 300
    or jsonb_typeof(p_place->'lat') is distinct from 'number' or jsonb_typeof(p_place->'lng') is distinct from 'number'
    or jsonb_typeof(p_place->'day') is distinct from 'number'
    or jsonb_typeof(p_place->'stopId') is distinct from 'string'
    or jsonb_typeof(p_place->'kind') is distinct from 'string'
    or jsonb_typeof(p_place->'cuisine') is distinct from 'string' then
    raise exception '장소 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if (p_place->>'lat')::numeric not between -90 and 90 or (p_place->>'lng')::numeric not between -180 and 180
    or (p_place->>'day')::numeric not between 0 and 3650 or (p_place->>'day')::numeric <> trunc((p_place->>'day')::numeric) then
    raise exception '장소 좌표와 일차를 확인해 주세요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text, 8));
  insert into public.trip_archives(trip_id, data) values(p_trip, '{}'::jsonb) on conflict do nothing;
  select data into current_data from public.trip_archives where trip_id = p_trip for update;
  places := coalesce(current_data->'food', '[]'::jsonb);
  if not exists(select 1 from jsonb_array_elements(places) place where place->>'id' = p_place->>'id') then
    if jsonb_array_length(places) >= 10000 then raise exception '저장 장소 한도에 도달했습니다.' using errcode = '22023'; end if;
    update public.trip_archives set data = jsonb_set(current_data, '{food}', places || jsonb_build_array(p_place), true) where trip_id = p_trip;
  end if;
  insert into public.saved_places(trip_id, place_id) values(p_trip, p_place->>'id') on conflict do nothing;
  return jsonb_build_object('saved', true, 'placeId', p_place->>'id');
end;
$$;
revoke all on function public.save_trip_place(uuid, jsonb) from public, anon;
grant execute on function public.save_trip_place(uuid, jsonb) to authenticated;
