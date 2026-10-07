-- Hunger counts calories (see packages/core/src/domain/hunger.ts): the pet's
-- bar is the last day's meals as a share of the eater's maintenance. Each meal
-- is kept on the pet already converted to bar points, so the pet carries
-- everything hunger needs and a shared pet works the same on both phones.
--
-- [{ "at": "<iso time>", "points": <0..100> }, ...], at most a day's worth.
-- NULL until the pet first eats under this rule; the app reads its old
-- nutrition as one meal until then.

alter table public.pets add column if not exists recent_meals jsonb;

alter table public.pets drop constraint if exists pets_recent_meals_valid;
alter table public.pets add constraint pets_recent_meals_valid check (
  recent_meals is null
  -- CASE, not AND: Postgres may evaluate either side of an AND first, and
  -- jsonb_array_length raises on a non-array instead of returning false.
  or case when jsonb_typeof(recent_meals) = 'array' then jsonb_array_length(recent_meals) <= 60 else false end
);
