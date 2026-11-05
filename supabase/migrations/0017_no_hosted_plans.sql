-- AIRO is self-hosted software: no plans, no trip limit, no subscriptions.
drop trigger if exists trips_limit on public.trips;
drop function if exists public.enforce_trip_limit();
drop table if exists public.subscriptions;
