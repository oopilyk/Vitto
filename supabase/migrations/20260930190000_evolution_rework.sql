-- Evolution, harder and steadier.
--
--   * Evolving needs level 15 (was 11), the build's stat at 60 (was 45) and a
--     lead of 15 (was 12) over the other two.
--   * The scholar is read from MIND SESSIONS, not the `mind` stat. `mind` decays
--     every day without a session (it drives mood and "foggy"), so a scholar
--     measured by it slipped out of its specialism, and runners and lifters
--     tipped in and out of the lead as it rose and fell. Sessions only count up:
--     3 points each on the 0-100 scale strength and endurance use, so a scholar
--     needs about 20.
--
-- Mirrors getPetBuild / lockEvolution in packages/core/src/domain/pet.ts. Pets
-- that already evolved keep their forms: earned forms are locked.

alter table public.pets
  add column if not exists mind_sessions integer not null default 0 check (mind_sessions >= 0),
  add column if not exists mind_sessions_today integer not null default 0;

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


-- Back-fill from the sessions already played: the owner's BRAIN_TRAINING events
-- since adoption. `vitto.admin_write` lets this past the daily cap above; it is
-- local to this migration's transaction.
-- One statement, so the flag and the update share a transaction however the
-- migration is run.
do $$
begin
  perform set_config('vitto.admin_write', 'on', true);
  update public.pets p
  set mind_sessions = coalesce((
    select count(*)::integer
    from public.health_events e
    where e.user_id = p.user_id
      and e.type = 'BRAIN_TRAINING'
      and e.occurred_at >= coalesce(p.adopted_at, p.created_at, '-infinity'::timestamptz)
  ), 0);
end;
$$;

-- Friends see the pet's form, which now depends on its sessions.
-- Otherwise identical to 20260930140000.
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
    'mind_sessions', p.mind_sessions,
    'last_event_at', p.last_event_at,
    'adopted_at', p.adopted_at,
    'created_at', p.created_at
  );
$$;
