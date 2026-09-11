#!/bin/bash
# AIRO Community Edition — database bootstrap and upgrade.
# Runs once from docker-entrypoint-initdb.d on first start; run it again after
# pulling new migrations:  docker compose exec db /docker-entrypoint-initdb.d/10-airo.sh
set -euo pipefail
: "${POSTGRES_USER:=postgres}" "${POSTGRES_DB:=airo}" "${AIRO_OWNER_EMAIL:=owner@localhost}"
OWNER='00000000-0000-4000-8000-000000000001'
psql=(psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq)

# Supabase-compatible auth shim: roles PostgREST switches to, and auth.uid()/auth.jwt()
# reading the verified JWT claims PostgREST sets per request. No Supabase Auth involved.
"${psql[@]}" <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute format('create role authenticator noinherit login password %L', '${POSTGRES_PASSWORD//\'/\'\'}');
  end if;
end \$\$;
grant anon, authenticated to authenticator;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.jwt() returns jsonb language sql stable as \$\$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb \$\$;
create or replace function auth.uid() returns uuid language sql stable as \$\$ select (auth.jwt()->>'sub')::uuid \$\$;
grant usage on schema auth, public to anon, authenticated, supabase_auth_admin;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
create table if not exists public.airo_migrations (name text primary key, applied_at timestamptz not null default now());
revoke all on public.airo_migrations from anon, authenticated;
SQL

for file in /migrations/*.sql; do
  name=$(basename "$file")
  if [ "$("${psql[@]}" -c "select 1 from public.airo_migrations where name = '$name'")" = "1" ]; then continue; fi
  "${psql[@]}" -f "$file"
  "${psql[@]}" -c "insert into public.airo_migrations (name) values ('$name')"
  echo "applied $name"
done

# Single owner. The pro subscription row is what lifts the 3-trip limit in the SQL trigger.
"${psql[@]}" <<SQL
insert into auth.users (id, email) values ('$OWNER', '${AIRO_OWNER_EMAIL//\'/\'\'}')
  on conflict (id) do update set email = excluded.email;
insert into public.subscriptions (user_id, plan, status) values ('$OWNER', 'pro', 'active')
  on conflict (user_id) do update set plan = 'pro', status = 'active';
notify pgrst, 'reload schema';
SQL
echo "AIRO database ready"
