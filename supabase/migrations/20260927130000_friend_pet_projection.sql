-- Friends read a fixed list of a pet's columns, not the whole row.
--
-- `20260910120000_onboarding_v2.sql` states the rule this restores: "The
-- friend-facing RPCs ... select an explicit column list ... never `select *`."
-- That stopped being true. A SELECT policy grants a ROW, and Postgres RLS
-- cannot restrict columns, so "Friends view accepted friend pets" handed an
-- accepted friend every column of the pets table -- whatever that table happens
-- to hold today. `20260909130000_friends_overview.sql` even reasoned from this,
-- returning `to_jsonb(p.*)` because "the existing policy already grants an
-- accepted friend read access to every column of that pet".
--
-- Two columns have been added since that reasoning was written:
--   * `persona`      (20260921120000) -- up to 300 characters of free text the
--                    person writes describing their pet's character.
--   * `personality_dials` (20260922120000) -- the five sliders behind it.
-- Neither was reviewed for friend visibility; both were published to every
-- accepted friend the moment they were added. That is the actual defect: not
-- these two columns, but a policy that publishes by default, so the next column
-- leaks too unless someone remembers.
--
-- So the direct policy goes, and friends read through a definer RPC with a
-- written-out column list -- the same shape `get_friend_profile` and
-- `get_friend_recent_activity` already use. Adding a column to `pets` now shows
-- a friend nothing until someone adds it here on purpose.
--
-- Safe to drop the policy in one step: the app is early access with no released
-- build in the wild, and `friendsService.loadFriendPet` (its only caller) moves
-- to the RPC in the same change.

-- ---------------------------------------------------------------------------
-- The projection, as one function both readers share.
-- ---------------------------------------------------------------------------
-- Everything `toPetState` in friendsService needs to draw a pet, and nothing
-- else. `personality` (an enum: sweet, savage, ...) stays, because the friend
-- view speaks in the pet's voice; `persona` and `personality_dials` do not.
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
    'last_event_at', p.last_event_at,
    'adopted_at', p.adopted_at,
    'created_at', p.created_at
  );
$$;

-- ---------------------------------------------------------------------------
-- One friend's pet.
-- ---------------------------------------------------------------------------
-- The gate is the one 20260927120000 settled on for the policy it replaces: an
-- accepted friendship with the adopter, AND the adopter still actively caring
-- for the pet (a creator who left a shared pet keeps `pets.user_id` forever).
create or replace function public.get_friend_pet(friend_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select public.friend_pet_json(p)
  from public.pets p
  where p.user_id = friend_id
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = auth.uid() and fr.addressee_id = friend_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = friend_id))
    )
    and exists (
      select 1 from public.pet_members m
      where m.pet_id = p.id and m.user_id = p.user_id and m.left_at is null
    )
  -- A user can leave a pet and adopt another, so `user_id` is not unique here.
  -- Newest wins, matching what the direct query it replaces did.
  order by p.created_at desc
  limit 1;
$$;

revoke all on function public.get_friend_pet(uuid) from public, anon;
grant execute on function public.get_friend_pet(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The batched list uses the same projection.
-- ---------------------------------------------------------------------------
-- Byte-for-byte the function from 20260909130000 apart from three things: the
-- pet is built by `friend_pet_json` instead of `to_jsonb(p.*)`, that pet must
-- still be actively cared for by the friend (same rule as 20260927120000), and
-- an email-shaped display name is scrubbed as it is everywhere else. The
-- signature is unchanged, so the client contract is too.
create or replace function public.get_friends_overview()
returns table(
  friend_id uuid,
  username text,
  display_name text,
  pet jsonb,
  last_activity_type text,
  last_activity_at timestamptz,
  friends_since timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.friend_id,
    prof.username,
    case
      when prof.display_name is null or btrim(prof.display_name) = '' or prof.display_name like '%@%' then null
      else prof.display_name
    end,
    (
      select public.friend_pet_json(p)
      from public.pets p
      where p.user_id = f.friend_id
        and exists (
          select 1 from public.pet_members m
          where m.pet_id = p.id and m.user_id = p.user_id and m.left_at is null
        )
      order by p.created_at desc
      limit 1
    ) as pet,
    act.type as last_activity_type,
    act.occurred_at as last_activity_at,
    f.friends_since
  from (
    select
      case
        when fr.requester_id = auth.uid() then fr.addressee_id
        else fr.requester_id
      end as friend_id,
      coalesce(fr.responded_at, fr.created_at) as friends_since
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (fr.requester_id = auth.uid() or fr.addressee_id = auth.uid())
  ) f
  left join public.profiles prof on prof.id = f.friend_id
  left join lateral (
    select he.type, he.occurred_at
    from public.health_events he
    where he.user_id = f.friend_id
      and he.occurred_at >= now() - interval '3 days'
    order by he.occurred_at desc
    limit 1
  ) act on true
  where exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = auth.uid() and fr.addressee_id = f.friend_id)
        or (fr.addressee_id = auth.uid() and fr.requester_id = f.friend_id))
  )
  order by f.friends_since desc;
$$;

revoke all on function public.get_friends_overview() from public, anon;
grant execute on function public.get_friends_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- And the direct row access goes.
-- ---------------------------------------------------------------------------
-- After this a friend cannot query `pets` at all; the RPCs above are the only
-- way in, and they answer with the column list written out above.
drop policy if exists "Friends view accepted friend pets" on public.pets;
