-- Sanity limits on what the app may claim about a pet's progress.
--
-- The care engine runs in the app, which saves levels, XP and stats straight
-- to `pets`. A modified app (or a direct call with the owner's own token) could
-- claim level 99 -- and since coins come from level-ups, mint coins with it --
-- or claim evolutions it never earned. Until the engine moves to the server,
-- this trigger bounds that to what a very active real player could manage:
--
--   * levels never go down, and at most MAX_LEVELS_PER_DAY are gained per UTC
--     day (a heavy real day is ~3; double, for a Health backfill of two days);
--   * strength and endurance gain at most MAX_STAT_GAIN_PER_DAY each per day
--     (a workout adds at most 4 strength, a cardio session at most 8 endurance).
--     Mind is not capped: a mind game legitimately refills it, and it decays;
--   * an evolution is only credited when the pet's (capped) stats earn it at the
--     moment of the save, and a form can only be picked once all three are;
--   * a brand-new pet starts where `createPet` starts it.
--
-- Anything over a cap is dropped, not refused: the save still stores its care.
-- Runs before `pets_coins_and_breed` (trigger names fire in alphabetical order),
-- so coins are only paid for the levels that survive. The service role and the
-- dev account (whose tools seed weeks of data at once) are exempt.

alter table public.pets
  add column if not exists progress_day date,
  add column if not exists levels_today integer not null default 0,
  add column if not exists strength_today integer not null default 0,
  add column if not exists endurance_today integer not null default 0;

create or replace function public.pets_check_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_levels constant integer := 6;
  max_stat_gain constant integer := 40;
  today date := (now() at time zone 'utc')::date;
  levels_used integer;
  strength_used integer;
  endurance_used integer;
  allowed_levels integer;
  gain integer;
  live text;
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(auth.jwt() ->> 'email', '') = 'kyleyli2005@gmail.com' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- An upsert of an existing pet also fires this; its update half is checked
    -- below. Only a genuinely new pet is reset to where adoption starts.
    if exists (select 1 from public.pets where id = new.id) then
      return new;
    end if;
    new.level := 1;
    new.xp := 0;
    new.strength := least(new.strength, 14);
    new.endurance := least(new.endurance, 16);
    new.mind := least(coalesce(new.mind, 20), 20);
    new.evolved_build := null;
    new.earned_builds := null;
    new.chosen_build := null;
    new.progress_day := today;
    new.levels_today := 0;
    new.strength_today := 0;
    new.endurance_today := 0;
    return new;
  end if;

  -- The day's allowance, from the stored row (the app never sends these).
  if old.progress_day is distinct from today then
    levels_used := 0; strength_used := 0; endurance_used := 0;
  else
    levels_used := old.levels_today; strength_used := old.strength_today; endurance_used := old.endurance_today;
  end if;

  -- Levels: never down, and only so many a day.
  if (new.level * 100 + new.xp) < (old.level * 100 + old.xp) then
    new.level := old.level;
    new.xp := old.xp;
  end if;
  allowed_levels := greatest(0, max_levels - levels_used);
  if new.level - old.level > allowed_levels then
    new.level := old.level + allowed_levels;
    new.xp := least(new.xp, 99);
  end if;
  levels_used := levels_used + (new.level - old.level);

  -- Strength and endurance: only so much gained a day. Drops are fine.
  gain := new.strength - old.strength;
  if gain > 0 then
    gain := least(gain, greatest(0, max_stat_gain - strength_used));
    new.strength := old.strength + gain;
    strength_used := strength_used + gain;
  end if;
  gain := new.endurance - old.endurance;
  if gain > 0 then
    gain := least(gain, greatest(0, max_stat_gain - endurance_used));
    new.endurance := old.endurance + gain;
    endurance_used := endurance_used + gain;
  end if;

  new.progress_day := today;
  new.levels_today := levels_used;
  new.strength_today := strength_used;
  new.endurance_today := endurance_used;

  -- Evolutions: the same rule as getPetBuild in packages/core/src/domain/pet.ts.
  live := case
    when new.level < 11 then null
    when new.endurance >= 45 and new.endurance - new.strength >= 12 and new.endurance - coalesce(new.mind, 20) >= 12 then 'runner'
    when new.strength >= 45 and new.strength - new.endurance >= 12 and new.strength - coalesce(new.mind, 20) >= 12 then 'lifter'
    when coalesce(new.mind, 20) >= 45 and coalesce(new.mind, 20) - new.endurance >= 12 and coalesce(new.mind, 20) - new.strength >= 12 then 'scholar'
  end;
  -- Everything already earned is kept (a stale app sending a shorter list does
  -- not erase any), and the only addition allowed is what the stats earn now.
  new.earned_builds := nullif(array(
    select distinct b from unnest(
      coalesce(old.earned_builds, '{}'::text[])
      || coalesce(array[old.evolved_build], '{}'::text[])
      || case when live is not null and live = any(coalesce(new.earned_builds, '{}'::text[])) then array[live] else '{}'::text[] end
    ) b
    where b is not null
  ), '{}'::text[]);
  -- The locked form is what keeps a pet from devolving (getPetBuild), so a save
  -- that leaves it out keeps the stored one, and one that names an unearned
  -- form keeps it too.
  if new.evolved_build is null
     or not (new.evolved_build = any(coalesce(new.earned_builds, '{}'::text[]))) then
    new.evolved_build := old.evolved_build;
  end if;
  if new.chosen_build is not null
     and not (new.chosen_build = any(coalesce(new.earned_builds, '{}'::text[])) and coalesce(cardinality(new.earned_builds), 0) = 3) then
    new.chosen_build := old.chosen_build;
  end if;

  return new;
end;
$$;

drop trigger if exists pets_check_progress on public.pets;
create trigger pets_check_progress
  before insert or update on public.pets
  for each row execute function public.pets_check_progress();
