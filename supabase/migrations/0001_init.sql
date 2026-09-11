-- 아이로 여행 계획 SaaS — 초기 스키마
-- 실행: supabase db push (또는 대시보드 SQL Editor 에 붙여넣기)

create extension if not exists "pgcrypto";

-- ── profiles ─────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  created_at  timestamptz not null default now()
);

-- 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── trips ────────────────────────────────────────────────────────────
create table if not exists public.trips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  start_date date,
  created_at timestamptz not null default now()
);
create index if not exists trips_user_idx on public.trips (user_id, created_at desc);

-- ── stops ────────────────────────────────────────────────────────────
create table if not exists public.stops (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null references public.trips(id) on delete cascade,
  name      text not null,
  lng       double precision not null check (lng between -180 and 180),
  lat       double precision not null check (lat between -90 and 90),
  day       int  not null check (day >= 1),
  position  int  not null default 0,
  time      text,
  note      text,
  map_query text,
  mode      text not null default 'ground' check (mode in ('flight','ground')),
  created_at timestamptz not null default now()
);
create index if not exists stops_trip_idx on public.stops (trip_id, day, position);

-- ── messages ─────────────────────────────────────────────────────────
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_trip_idx on public.messages (trip_id, created_at);

-- ── subscriptions ────────────────────────────────────────────────────
-- TODO(결제): 결제사(Stripe / 토스페이먼츠) 결정 후 웹훅이 이 테이블을 갱신한다.
--             provider / provider_customer_id / provider_subscription_id 를 그대로 쓰면 된다.
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  plan          text not null default 'free' check (plan in ('free','pro')),
  status        text not null default 'active' check (status in ('active','past_due','canceled')),
  provider      text,
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── RLS: 자기 데이터만 ────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.trips         enable row level security;
alter table public.stops         enable row level security;
alter table public.messages      enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists trips_own on public.trips;
create policy trips_own on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- stops / messages 는 부모 trip 의 소유자에게만
drop policy if exists stops_own on public.stops;
create policy stops_own on public.stops
  for all using (
    exists (select 1 from public.trips t where t.id = stops.trip_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.trips t where t.id = stops.trip_id and t.user_id = auth.uid())
  );

drop policy if exists messages_own on public.messages;
create policy messages_own on public.messages
  for all using (
    exists (select 1 from public.trips t where t.id = messages.trip_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.trips t where t.id = messages.trip_id and t.user_id = auth.uid())
  );

-- 구독은 본인만 읽는다. 쓰기는 결제 웹훅(service_role)만 — RLS 를 우회한다.
drop policy if exists subscriptions_read_own on public.subscriptions;
create policy subscriptions_read_own on public.subscriptions
  for select using (auth.uid() = user_id);
