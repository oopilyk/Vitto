-- Food search has a per-account limit.
--
-- `food-search` spends the server's own USDA and FatSecret quotas, which every
-- account shares. Sign-in was its only gate, so one script -- or one account
-- looping searches -- could use up the day's quota and leave food search
-- broken for everyone. Each account now gets 60 searches an hour and 300 a
-- day (barcode lookups included). A person logging meals searches on Enter,
-- not per keystroke, and a heavy day is a few dozen.
--
-- Over the limit the function answers 429, and the app falls back exactly as
-- it does when the server is unreachable: USDA asked from the phone for a
-- name, OpenFoodFacts for a barcode. So a limited person still finds food.
--
-- Same shape as `claim_ai_call` (20261002130000): one transaction takes a
-- per-account lock, counts, and records the search before it is made.

create table if not exists public.food_search_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists food_search_calls_user_time on public.food_search_calls (user_id, created_at desc);
create index if not exists food_search_calls_time on public.food_search_calls (created_at);

-- Server-only: RLS on and no policies, so no client can read or write it.
alter table public.food_search_calls enable row level security;

-- True when the search may go ahead (and is now counted).
create or replace function public.claim_food_search(
  p_user uuid,
  p_hour_limit integer,
  p_day_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  last_hour integer;
  last_day integer;
begin
  -- Serialises this account's claims, so simultaneous searches queue here and
  -- each one sees the rows the ones before it wrote.
  perform pg_advisory_xact_lock(hashtext('food_search:' || p_user::text));

  select count(*) filter (where created_at >= now() - interval '1 hour'), count(*)
  into last_hour, last_day
  from food_search_calls
  where user_id = p_user and created_at >= now() - interval '24 hours';
  if last_hour >= p_hour_limit or last_day >= p_day_limit then
    return false;
  end if;

  insert into food_search_calls (user_id) values (p_user);

  -- Housekeeping, now and then: nothing older than a day is read again.
  if random() < 0.01 then
    delete from food_search_calls where created_at < now() - interval '2 days';
  end if;
  return true;
end;
$$;

revoke all on function public.claim_food_search(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_food_search(uuid, integer, integer) to service_role;
