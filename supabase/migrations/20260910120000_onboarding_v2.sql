-- Onboarding v2.
--
-- The progressive onboarding flow populates the REAL profile and pet models --
-- there is no separate persisted "onboarding" object. Every column here is
-- nullable / defaulted and added with `if not exists`, so an un-migrated
-- database and `saveDroppingMissingColumns` (which drops unknown columns and
-- retries) both keep working while this rolls out.
--
-- Split by ownership, matching the rest of the schema:
--   profiles -> who the USER is (baseline, goals, activity, nutrition inputs)
--   pets     -> who the COMPANION is (personality travels with the pet, not
--               the user, so multi-pet / pet-switching later stays clean)
--
-- Authorization: `profiles` already has "Users manage their profile"
-- (auth.uid() = id) and `pets` has "Users manage their pet" (auth.uid() =
-- user_id) covering every column, new ones included. The friend-facing RPCs
-- (search_profiles / get_friend_profile / friends_overview) select an explicit
-- column list -- username, display_name, pet game-stats -- never `select *`,
-- so none of the private fields below can leak through social features.

-- profiles: identity, goals, activity, nutrition inputs ----------------------

-- Finally persisted: was a non-persisted `useState(10000)` in App.tsx that
-- reset on every launch.
alter table public.profiles
  add column if not exists step_goal integer check (step_goal between 1000 and 50000);

-- The game-facing intent. `profiles.goal` (lose/maintain/gain) stays the
-- energy-balance axis the calorie maths reads; it is seeded from this and the
-- user can override it on the weight step.
alter table public.profiles
  add column if not exists primary_goal text check (primary_goal in (
    'build_muscle', 'get_stronger', 'gain_weight', 'lose_weight', 'maintain',
    'improve_fitness', 'build_habits', 'athletic_performance', 'other'));

alter table public.profiles
  add column if not exists secondary_goals text[] not null default '{}'::text[]
    check (secondary_goals <@ array[
      'build_muscle', 'get_stronger', 'gain_weight', 'lose_weight', 'maintain',
      'improve_fitness', 'build_habits', 'athletic_performance', 'other']::text[]);

-- How the user trains. `profiles.training_style` (strength/cardio/mixed) stays
-- what the protein maths reads and is derived from this.
alter table public.profiles
  add column if not exists training_types text[] not null default '{}'::text[]
    check (training_types <@ array[
      'weightlifting', 'running', 'cycling', 'sports', 'hiit', 'classes', 'other']::text[]);

alter table public.profiles
  add column if not exists dietary_preference text check (dietary_preference in (
    'none', 'vegetarian', 'vegan', 'pescatarian', 'other'));

alter table public.profiles
  add column if not exists motivations text[] not null default '{}'::text[]
    check (motivations <@ array[
      'progress', 'streaks', 'competition', 'friends', 'goals', 'pet', 'habits']::text[]);

-- pets: the companion ------------------------------------------------------

alter table public.pets
  add column if not exists personality text check (personality in (
    'energetic', 'chill', 'competitive', 'supportive'));
