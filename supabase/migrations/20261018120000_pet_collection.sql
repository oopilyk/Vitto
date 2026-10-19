-- The pet's collection: forms to wear, and every animal it has been.
--
-- Forms. A pet may now wear its base look or any evolution it has earned, not
-- only once all three are earned. Which one is still the pet's own pick:
--   * `chosen_build` stays what it was, an evolution or null. It is NOT given a
--     'base' value: app builds already on phones read it straight into a
--     sprite lookup, and an unknown value there could break the pet's art.
--   * `show_base` is new: the base look, picked by hand. Builds from before it
--     never read or send it, so they draw the evolution as they always did and
--     their saves leave the flag alone.
--
-- Animals. `owned_breeds` is every breed the pet has been. A new one costs
-- coins (500) through `switch_pet_breed` as before and joins the list; going
-- back to one already owned is free. Like coins and the breed itself, an
-- ordinary save cannot change it, so no build -- old or new -- can add an
-- animal without paying, and none can drop one by leaving the column out.
--
-- Additive only: two columns, functions replaced in place, a backfill that
-- only fills empty lists. Nothing is deleted.

alter table public.pets
  add column if not exists show_base boolean not null default false,
  add column if not exists owned_breeds text[];

-- from 20261012120000_dev_account_claim.sql, with the form rules relaxed and
-- the base flag handled.
create or replace function public.pets_check_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_levels constant integer := 6;
  max_stat_gain constant integer := 40;
  max_mind_sessions constant integer := 10;
  min_level constant integer := 15;
  min_stat constant integer := 60;
  min_lead constant integer := 15;
  mind_score integer;
  sessions_used integer;
  today date := (now() at time zone 'utc')::date;
  levels_used integer;
  strength_used integer;
  endurance_used integer;
  allowed_levels integer;
  gain integer;
  live text;
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('vitto.admin_write', true) = 'on'
     or public.is_dev_account() then
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
    new.mind_sessions := 0;
    new.evolved_build := null;
    new.earned_builds := null;
    new.chosen_build := null;
    new.show_base := false;
    new.progress_day := today;
    new.levels_today := 0;
    new.strength_today := 0;
    new.endurance_today := 0;
    return new;
  end if;

  -- The day's allowance, from the stored row (the app never sends these).
  if old.progress_day is distinct from today then
    levels_used := 0; strength_used := 0; endurance_used := 0; sessions_used := 0;
  else
    levels_used := old.levels_today; strength_used := old.strength_today; endurance_used := old.endurance_today;
    sessions_used := old.mind_sessions_today;
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

  -- Mind sessions only count up, and only so many a day.
  gain := new.mind_sessions - old.mind_sessions;
  if gain < 0 then
    new.mind_sessions := old.mind_sessions;
  else
    gain := least(gain, greatest(0, max_mind_sessions - sessions_used));
    new.mind_sessions := old.mind_sessions + gain;
    sessions_used := sessions_used + gain;
  end if;
  new.mind_sessions_today := sessions_used;

  new.progress_day := today;
  new.levels_today := levels_used;
  new.strength_today := strength_used;
  new.endurance_today := endurance_used;

  -- Evolutions: the same rule as getPetBuild in packages/core/src/domain/pet.ts.
  -- Mind is read from sessions (3 points each, to 100), never the decaying stat.
  mind_score := least(100, new.mind_sessions * 3);
  live := case
    when new.level < min_level then null
    when new.endurance >= min_stat and new.endurance - new.strength >= min_lead and new.endurance - mind_score >= min_lead then 'runner'
    when new.strength >= min_stat and new.strength - new.endurance >= min_lead and new.strength - mind_score >= min_lead then 'lifter'
    when mind_score >= min_stat and mind_score - new.endurance >= min_lead and mind_score - new.strength >= min_lead then 'scholar'
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
  -- Any earned form may be worn (it used to take all three), and nothing else.
  if new.chosen_build is not null
     and not (new.chosen_build = any(coalesce(new.earned_builds, '{}'::text[]))) then
    new.chosen_build := old.chosen_build;
  end if;
  -- The base look is always the pet's to wear. A build from before the flag
  -- never sends it, so its saves keep the stored one; but when such a build
  -- picks an evolution by hand, that newer pick wins over an older base pick.
  new.show_base := coalesce(new.show_base, old.show_base, false);
  if new.chosen_build is not null
     and new.chosen_build is distinct from old.chosen_build
     and new.show_base is not distinct from old.show_base then
    new.show_base := false;
  end if;

  return new;
end;
$$;

-- from 20260930170000_coins_on_level_up_only.sql, now also keeping the
-- animals owned out of an ordinary save's reach.
create or replace function public.pets_coins_and_breed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin tooling and switch_pet_breed manage coins themselves.
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('vitto.coins_write', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Adopting is free, a new pet has earned nothing yet, and the animal it
    -- was adopted as is the first one it owns.
    new.coins := 0;
    new.owned_breeds := case when new.breed is null then null else array[new.breed] end;
    return new;
  end if;

  new.coins := old.coins + greatest(0, new.level - old.level) * 50;
  -- The animal, and the animals owned, only change through switch_pet_breed.
  new.breed := old.breed;
  new.owned_breeds := old.owned_breeds;
  return new;
end;
$$;

-- from 20261012120000_dev_account_claim.sql. Same caller rules and errors; an
-- animal the pet already owns is now free, and a new one is added to the list.
create or replace function public.switch_pet_breed(p_pet_id uuid, p_breed text)
returns table(breed text, coins integer, version integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cost constant integer := 500;
  free boolean := public.is_dev_account();
  current_row public.pets;
  owned text[];
  already_owned boolean;
begin
  select * into current_row from public.pets where id = p_pet_id for update;
  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Active carers only: a creator who has left no longer spends this pet's coins.
  if not public.is_active_pet_member(p_pet_id) then
    raise exception 'NOT_YOUR_PET' using errcode = '42501';
  end if;
  if current_row.breed is not distinct from p_breed then
    return query select current_row.breed, current_row.coins, current_row.version;
    return;
  end if;
  -- A null would be "owned" by nobody and stored in the list as a hole.
  if p_breed is null then
    raise exception 'BREED_REQUIRED' using errcode = '22004';
  end if;

  -- What the pet owns always includes what it is now (a pet from before the
  -- list, or one whose breed was set by admin tooling).
  owned := coalesce(current_row.owned_breeds, '{}'::text[]);
  if current_row.breed is not null and not (current_row.breed = any(owned)) then
    owned := owned || current_row.breed;
  end if;
  already_owned := p_breed = any(owned);
  if not already_owned then
    owned := owned || p_breed;
  end if;

  if not free and not already_owned and current_row.coins < cost then
    raise exception 'NOT_ENOUGH_COINS' using errcode = 'P0001', detail = current_row.coins::text;
  end if;

  perform set_config('vitto.coins_write', 'on', true);
  return query
    update public.pets p
    set breed = p_breed,
        owned_breeds = owned,
        coins = p.coins - case when free or already_owned then 0 else cost end
    where p.id = p_pet_id
    returning p.breed, p.coins, p.version;
end;
$$;

revoke all on function public.switch_pet_breed(uuid, text) from public, anon;
grant execute on function public.switch_pet_breed(uuid, text) to authenticated;

-- Friends see the form the pet wears, base included.
-- Otherwise identical to 20260930190000.
create or replace function public.friend_pet_json(p public.pets)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'name', p.name,
    'species', p.species,
    'breed', p.breed,
    'personality', p.personality,
    'level', p.level,
    'xp', p.xp,
    'health', p.health,
    'energy', p.energy,
    'happiness', p.happiness,
    'nutrition', p.nutrition,
    'strength', p.strength,
    'pushing_strength', p.pushing_strength,
    'pulling_strength', p.pulling_strength,
    'leg_strength', p.leg_strength,
    'endurance', p.endurance,
    'recovery', p.recovery,
    'mind', p.mind,
    'mood', p.mood,
    'evolved_build', p.evolved_build,
    'earned_builds', p.earned_builds,
    'chosen_build', p.chosen_build,
    'show_base', p.show_base,
    'mind_sessions', p.mind_sessions,
    'last_event_at', p.last_event_at,
    'adopted_at', p.adopted_at,
    'created_at', p.created_at
  );
$$;

-- Every pet owns the animal it is now. The flags are the same bypasses the
-- triggers above give admin tooling, local to this migration's transaction, so
-- the backfill moves nothing but the list (not coins, the day's allowances or
-- the breed).
select set_config('vitto.coins_write', 'on', true);
select set_config('vitto.admin_write', 'on', true);
update public.pets
set owned_breeds = array[breed]
where owned_breeds is null and breed is not null;
