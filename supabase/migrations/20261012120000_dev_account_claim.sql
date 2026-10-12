-- The dev account, by a claim users cannot edit rather than by email.
--
-- Three functions let the dev account past their limits (progress caps,
-- personality changes, breed switches) by comparing the token's email to one
-- address. An email is the wrong key for that: whoever holds an account with
-- that address in this project, by whatever route, gets every bypass. The
-- flag now lives in `app_metadata`, which only the service role (or the
-- dashboard) can write; it rides in the login token, so the database and the
-- edge functions both read it from there.

create or replace function public.is_dev_account()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'vitto_dev', '') = 'true';
$$;

-- The one dev account today. Additive: merges the flag into what is there.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"vitto_dev": true}'::jsonb
where email = 'kyleyli2005@gmail.com';

-- The three functions, exactly as they stand, with the email check swapped for
-- the claim.

-- from 20260930190000_evolution_rework.sql
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
  if new.chosen_build is not null
     and not (new.chosen_build = any(coalesce(new.earned_builds, '{}'::text[])) and coalesce(cardinality(new.earned_builds), 0) = 3) then
    new.chosen_build := old.chosen_build;
  end if;

  return new;
end;
$$;

-- from 20260930150000_personality_change_limit.sql
create or replace function public.limit_personality_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.personality is not distinct from old.personality
     and new.persona is not distinct from old.persona
     and new.personality_dials is not distinct from old.personality_dials then
    return new;
  end if;

  -- The service role (admin tooling, backfills) is not a person changing a voice.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- The dev account is uncapped here as it is everywhere else (DEV_EMAILS in
  -- the companion function); its changes are still logged.
  if not public.is_dev_account()
     and public.personality_changes_this_month(new.id) >= public.personality_change_limit() then
    new.personality := old.personality;
    new.persona := old.persona;
    new.personality_dials := old.personality_dials;
    return new;
  end if;

  insert into public.pet_personality_changes (pet_id, user_id) values (new.id, auth.uid());
  return new;
end;
$$;

-- from 20261004130000_security_fixes.sql
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
  if not free and current_row.coins < cost then
    raise exception 'NOT_ENOUGH_COINS' using errcode = 'P0001', detail = current_row.coins::text;
  end if;

  perform set_config('vitto.coins_write', 'on', true);
  return query
    update public.pets p
    set breed = p_breed,
        coins = p.coins - case when free then 0 else cost end
    where p.id = p_pet_id
    returning p.breed, p.coins, p.version;
end;
$$;
