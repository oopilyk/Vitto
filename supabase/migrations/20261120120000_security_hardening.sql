-- Security hardening, from the November 2026 sweep. Four separate holes, all
-- of them reachable by a signed-in user sending their own requests instead of
-- using the app.
--
--   1. Coins could be minted without limit by stepping a pet between level L
--      at 100 xp and level L+1 at 0 xp (pets_check_progress).
--   2. are_friends / blocked_between answered for ANY two users, so anyone
--      could ask who is friends with whom, and whether they had been blocked.
--   3. The ten-reactions-a-day limit trusted the client's created_at.
--   4. Username search had no limit, so the whole directory could be walked.

-- ---------------------------------------------------------------------------
-- 1. Pet progress
-- ---------------------------------------------------------------------------

-- As in 20261018120000_pet_collection.sql, with three changes: the level is
-- checked on its own (see the comment at the check), the day's allowances are
-- never read as negative, and a new pet's mind-session allowance starts at
-- zero like the other three.
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
    new.mind_sessions_today := 0;
    return new;
  end if;

  -- The day's allowance, from the stored row (the app never sends these).
  if old.progress_day is distinct from today then
    levels_used := 0; strength_used := 0; endurance_used := 0; sessions_used := 0;
  else
    levels_used := greatest(0, old.levels_today);
    strength_used := greatest(0, old.strength_today);
    endurance_used := greatest(0, old.endurance_today);
    sessions_used := greatest(0, old.mind_sessions_today);
  end if;

  -- Levels: never down, and only so many a day. The level is compared on its
  -- own: level L at 100 xp and level L+1 at 0 xp add up to the same total, so
  -- a sum let a save step down a level for free and climb back for coins.
  if new.level < old.level or (new.level = old.level and new.xp < old.xp) then
    new.level := old.level;
    new.xp := old.xp;
  end if;
  allowed_levels := greatest(0, max_levels - levels_used);
  if new.level - old.level > allowed_levels then
    new.level := old.level + allowed_levels;
    new.xp := least(new.xp, 99);
  end if;
  levels_used := levels_used + greatest(0, new.level - old.level);

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


-- Balances are not touched here. A pet earns 50 coins a level and nothing
-- else, so `coins > (level - 1) * 50` is the mark of one that used the hole;
-- which of those to correct is a decision for a person, not a migration.

-- ---------------------------------------------------------------------------
-- 2. Friendship and block lookups
-- ---------------------------------------------------------------------------

-- Still "are these two accepted friends", but only for a pair the caller is
-- part of. The reactions policy asks it about (auth.uid(), their friend), so
-- nothing the app does changes; asking about two other people now answers no.
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (coalesce(auth.role(), '') = 'service_role' or auth.uid() in (p_a, p_b))
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = p_a and fr.addressee_id = p_b)
          or (fr.requester_id = p_b and fr.addressee_id = p_a))
    );
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- "Nothing tells the blocked person" (20261110120000): this did. Its only
-- callers are search_profiles and refuse_blocked_friend_request, which run as
-- their owner and keep working; no client ever called it.
revoke all on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reactions: ten to one friend in 24 hours, counted on the server's clock
-- ---------------------------------------------------------------------------

-- The policy counts rows by created_at, and an insert could name its own
-- (say, the year 2000), so its reactions were never counted. The time is
-- stamped here now, the count is taken under a lock so a burst cannot all read
-- the same number, and a new reaction always starts unseen.
create or replace function public.limit_friend_reactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  new.seen_at := null;
  perform pg_advisory_xact_lock(hashtext('friend_reactions:' || new.from_user::text));
  if (
    select count(*) from public.friend_reactions r
    where r.from_user = new.from_user
      and r.to_user = new.to_user
      and r.created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'That''s a lot of reactions for one friend today. Try again tomorrow.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.limit_friend_reactions() from public, anon, authenticated;

drop trigger if exists friend_reactions_limit on public.friend_reactions;
create trigger friend_reactions_limit
  before insert on public.friend_reactions
  for each row execute function public.limit_friend_reactions();

-- ---------------------------------------------------------------------------
-- 4. Username search: 120 an hour per account
-- ---------------------------------------------------------------------------

-- Every search made, the last hour kept; server-only (RLS on, no policies).
create table if not exists public.profile_search_calls (
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists profile_search_calls_user_time
  on public.profile_search_calls (user_id, created_at desc);
alter table public.profile_search_calls enable row level security;

-- The search itself is exactly as in 20261110120000_report_and_block.sql. It
-- returns ids, twenty at a time, for any three-letter prefix; with no limit a
-- script could list every account. The app searches after a pause in typing,
-- so a person never comes near 120 in an hour.
create or replace function public.search_profiles(search_query text)
returns table(id uuid, username text, display_name text)
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  caller uuid := auth.uid();
  made integer;
begin
  if caller is null then
    return;
  end if;
  -- Too short to search: answered with nothing, and not counted.
  if length(btrim(coalesce(search_query, ''))) < 3 then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('profile_search:' || caller::text));
  delete from public.profile_search_calls c
  where c.user_id = caller and c.created_at < now() - interval '1 hour';
  select count(*) into made from public.profile_search_calls c where c.user_id = caller;
  if made >= 120 then
    raise exception 'That''s a lot of searches. Try again in a little while.'
      using errcode = 'P0001';
  end if;
  insert into public.profile_search_calls (user_id) values (caller);

  return query
  select
    p.id,
    p.username,
    case
      when p.display_name is null or btrim(p.display_name) = '' or p.display_name like '%@%' then null
      else p.display_name
    end
  from public.profiles p
  where p.username is not null
    and p.username ilike replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
    and p.id <> caller
    and not public.blocked_between(caller, p.id)
  order by p.username
  limit 20;
end;
$$;

revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;
