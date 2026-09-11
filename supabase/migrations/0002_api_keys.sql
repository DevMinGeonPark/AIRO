-- MCP 등 외부 클라이언트용 API 키.
-- 토큰 원문은 저장하지 않는다. SHA-256 해시만 보관하고, 조회용으로 앞 8자만 prefix 에 둔다.

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  prefix       text not null,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create index if not exists api_keys_user_idx on public.api_keys (user_id, created_at desc);

alter table public.api_keys enable row level security;

-- 본인 키만. token_hash 컬럼이 함께 보이지만 원문 복원은 불가능하다.
drop policy if exists api_keys_own on public.api_keys;
create policy api_keys_own on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/*
 * Bearer 토큰 → 소유자 해석.
 * MCP 요청에는 세션 쿠키가 없어 RLS 아래에서는 아무것도 못 읽는다. 그래서 딱 이
 * 한 가지 일만 하는 security definer 함수를 열어둔다: 해시를 받아 소유자와
 * 그 해시를 돌려준다. 호출자가 이미 해시를 알고 있으므로 새로 새는 정보는 없다.
 * (호출부는 돌려받은 해시를 상수시간 비교로 한 번 더 확인한다.)
 * 폐기됐거나 없는 키면 0행.
 */
create or replace function public.api_key_owner(p_hash text)
returns table (user_id uuid, token_hash text)
language plpgsql security definer set search_path = public as $$
begin
  update public.api_keys k
     set last_used_at = now()
   where k.token_hash = p_hash and k.revoked_at is null;

  return query
    select k.user_id, k.token_hash
      from public.api_keys k
     where k.token_hash = p_hash and k.revoked_at is null;
end;
$$;

revoke all on function public.api_key_owner(text) from public;
grant execute on function public.api_key_owner(text) to anon, authenticated;
