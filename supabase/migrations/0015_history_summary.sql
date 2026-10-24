-- Keep the history list small: reading keys from each full PDF/image snapshot
-- repeatedly decompresses large audit values and can exceed the API timeout.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create function public.trip_change_fields(p_changes jsonb) returns text[]
language sql immutable strict parallel safe set search_path = '' as $$
  select array(select jsonb_object_keys(p_changes));
$$;

alter table public.trip_changes add column change_fields text[]
  generated always as (public.trip_change_fields(changes)) stored;

create or replace function public.list_trip_changes(p_trip uuid,p_before bigint default null,p_limit integer default 20) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('changes',coalesce(jsonb_agg(row_to_json(page) order by page.id::bigint desc),'[]')) from (
    select id::text,created_at,change_fields as fields
    from public.trip_changes where trip_id = p_trip and (p_before is null or id < p_before)
    order by public.trip_changes.id desc limit greatest(1,least(coalesce(p_limit,20),50))
  ) page;
$$;

-- Only the existing account-scoped history RPC is exposed to callers.
revoke all on function public.trip_change_fields(jsonb) from public,anon,authenticated;
