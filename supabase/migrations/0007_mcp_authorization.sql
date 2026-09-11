-- Supabase OAuth Server manages PKCE, codes, refresh rotation and client registration.
-- AIRO owns per-client itinerary permissions and immediately revocable grants.
alter table public.api_keys
  add column scopes text[] not null default array['trips:read','trips:write'],
  add column expires_at timestamptz;
alter table public.api_keys add constraint api_keys_scopes_valid check
  (scopes <@ array['trips:read','trips:write'] and scopes @> array['trips:read']);

create table public.mcp_settings (
  singleton boolean primary key default true check (singleton),
  resource text not null check (resource like 'https://%/api/mcp' or resource like 'http://localhost:%/api/mcp')
);
insert into public.mcp_settings(singleton,resource) values(true,'https://airo.dev-heptivision.com/api/mcp');
alter table public.mcp_settings enable row level security;
revoke all on public.mcp_settings from anon,authenticated;

create table public.mcp_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  client_name text not null,
  redirect_uri text not null,
  permissions text[] not null default array['trips:read'] check
    (permissions <@ array['trips:read','trips:write'] and permissions @> array['trips:read']),
  grant_version uuid not null default gen_random_uuid(),
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(user_id,client_id)
);
alter table public.mcp_connections enable row level security;
create policy mcp_connections_manage on public.mcp_connections for all to authenticated
  using (auth.uid() = user_id and coalesce(auth.jwt()->>'client_id','') = '' and coalesce(auth.jwt()->>'airo_key_id','') = '')
  with check (auth.uid() = user_id and coalesce(auth.jwt()->>'client_id','') = '' and coalesce(auth.jwt()->>'airo_key_id','') = '');
grant select,insert,update on public.mcp_connections to authenticated;

-- Called by the resource server with a verified OAuth JWT, without cookie sessions.
create or replace function public.mcp_connection_permissions() returns text[]
language sql stable security definer set search_path = '' as $$
  select c.permissions from public.mcp_connections c cross join public.mcp_settings config
  where c.user_id = auth.uid() and c.client_id::text = auth.jwt()->>'client_id'
    and c.grant_version::text = auth.jwt()->>'mcp_grant_version' and c.revoked_at is null
    and (auth.jwt()->'aud' = to_jsonb(config.resource) or auth.jwt()->'aud' @> jsonb_build_array(config.resource));
$$;
revoke all on function public.mcp_connection_permissions() from public,anon;
grant execute on function public.mcp_connection_permissions() to authenticated;

create or replace function public.airo_mcp_allowed(p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare permissions text[];
begin
  if coalesce(auth.jwt()->>'client_id','') <> '' then
    permissions := public.mcp_connection_permissions();
  elsif coalesce(auth.jwt()->>'airo_key_id','') <> '' then
    select k.scopes into permissions from public.api_keys k
      where k.id::text = auth.jwt()->>'airo_key_id' and k.user_id = auth.uid() and k.revoked_at is null
        and (k.expires_at is null or k.expires_at > now());
  else return true; end if;
  return coalesce((case when p_write then 'trips:write' else 'trips:read' end) = any(permissions),false);
end;
$$;
revoke all on function public.airo_mcp_allowed(boolean) from public,anon;
grant execute on function public.airo_mcp_allowed(boolean) to authenticated;

-- Restrictive policies supplement, never replace, the existing owner RLS policies.
do $$ declare tbl text; begin
  foreach tbl in array array['trips','stops','messages','trip_archives','saved_places','usage','chat_requests','mutation_receipts'] loop
    execute format('create policy mcp_read_guard on public.%I as restrictive for select to authenticated using (public.airo_mcp_allowed(false))',tbl);
    execute format('create policy mcp_insert_guard on public.%I as restrictive for insert to authenticated with check (public.airo_mcp_allowed(true))',tbl);
    execute format('create policy mcp_update_guard on public.%I as restrictive for update to authenticated using (public.airo_mcp_allowed(true)) with check (public.airo_mcp_allowed(true))',tbl);
    execute format('create policy mcp_delete_guard on public.%I as restrictive for delete to authenticated using (public.airo_mcp_allowed(true))',tbl);
  end loop;
end $$;
create policy mcp_keys_guard on public.api_keys as restrictive for all to authenticated
  using (coalesce(auth.jwt()->>'client_id','') = '' and coalesce(auth.jwt()->>'airo_key_id','') = '')
  with check (coalesce(auth.jwt()->>'client_id','') = '' and coalesce(auth.jwt()->>'airo_key_id','') = '');
create policy mcp_profile_guard on public.profiles as restrictive for all to authenticated
  using (coalesce(auth.jwt()->>'client_id','') = '' and coalesce(auth.jwt()->>'airo_key_id','') = '')
  with check (coalesce(auth.jwt()->>'client_id','') = '' and coalesce(auth.jwt()->>'airo_key_id','') = '');
create policy mcp_subscription_guard on public.subscriptions as restrictive for select to authenticated using (public.airo_mcp_allowed(false));

create or replace function public.resolve_mcp_key(p_hash text)
returns table(user_id uuid,token_hash text,key_id uuid,scopes text[])
language plpgsql security definer set search_path = '' as $$
begin
  update public.api_keys k set last_used_at = now() where k.token_hash = p_hash and k.revoked_at is null
    and (k.expires_at is null or k.expires_at > now());
  return query select k.user_id,k.token_hash,k.id,k.scopes from public.api_keys k
    where k.token_hash = p_hash and k.revoked_at is null and (k.expires_at is null or k.expires_at > now());
end;
$$;
revoke all on function public.resolve_mcp_key(text) from public;
grant execute on function public.resolve_mcp_key(text) to anon,authenticated;
-- The old resolver must also respect expiry.
create or replace function public.api_key_owner(p_hash text) returns table(user_id uuid,token_hash text)
language sql security definer set search_path = '' as $$ select r.user_id,r.token_hash from public.resolve_mcp_key(p_hash) r; $$;

-- Enable this as the Custom Access Token Hook in Auth > Hooks AFTER applying this migration.
-- If a hook already exists, merge this logic with it; do not silently replace it.
create or replace function public.airo_mcp_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := event->'claims';
  oauth_client text := coalesce(event->>'client_id',claims->>'client_id');
  connection public.mcp_connections%rowtype;
  resource_url text;
begin
  if coalesce(oauth_client,'') = '' then return event; end if;
  select * into connection from public.mcp_connections c
    where c.user_id::text = event->>'user_id' and c.client_id::text = oauth_client and c.revoked_at is null;
  if not found then return event; end if;
  select resource into resource_url from public.mcp_settings where singleton;
  -- Never turn a token intended for another resource into an AIRO token.
  if claims->'aud' <> '"authenticated"'::jsonb and claims->'aud' <> to_jsonb(resource_url)
    and not (claims->'aud' @> jsonb_build_array(resource_url)) then return event; end if;
  claims := claims || jsonb_build_object('client_id',oauth_client,'aud',jsonb_build_array('authenticated',resource_url),
    'mcp_grant_version',connection.grant_version::text,'mcp_permissions',to_jsonb(connection.permissions));
  return jsonb_set(event,'{claims}',claims);
end;
$$;
revoke all on function public.airo_mcp_token_hook(jsonb) from public,anon,authenticated;
grant execute on function public.airo_mcp_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

create table public.mcp_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index mcp_requests_user_time on public.mcp_requests(user_id,created_at);
alter table public.mcp_requests enable row level security;
revoke all on public.mcp_requests from anon,authenticated;
create or replace function public.consume_mcp_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or not public.airo_mcp_allowed(false) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('mcp-rate:' || owner_id::text,0));
  delete from public.mcp_requests where user_id = owner_id and created_at < now() - interval '1 hour';
  if (select count(*) from public.mcp_requests where user_id = owner_id and created_at > now() - interval '1 minute') >= 120 then return false; end if;
  insert into public.mcp_requests(user_id) values(owner_id);
  return true;
end;
$$;
revoke all on function public.consume_mcp_request() from public,anon;
grant execute on function public.consume_mcp_request() to authenticated;
notify pgrst, 'reload schema';
