-- Friends & Social Pets: one batched read for the whole friends list.
--
-- The friends list row needs three things per friend -- the other party's
-- minimal profile, their pet, and a privacy-safe "what were they up to" signal.
-- Fetched separately that is get_friend_profile + loadFriendPet +
-- get_friend_recent_activity per friend, i.e. 3N round trips to paint one
-- screen. This RPC returns exactly one row per accepted friend with all three
-- already joined, so the client makes a single call (see the new
-- `FriendOverview` contract in packages/core/src/domain/friends.ts and its use
-- in packages/core/src/domain/socialPetStatus.ts -- feed `pet` + `[lastActivity]`
-- straight into `deriveSocialPetStatus`).
--
-- Privacy model -- identical lines to the two migrations this sits behind
-- (20260904120000_friends.sql, 20260908120000_friend_activity_status.sql):
--
--   * SECURITY DEFINER + `set search_path = public` + `stable`, with
--     `revoke all ... from public; grant execute ... to authenticated;` -- the
--     same envelope as search_profiles / get_friend_profile /
--     get_friend_recent_activity.
--   * Every friend row is gated by the same accepted-friendship
--     `exists (select 1 from public.friend_requests fr where fr.status =
--     'accepted' and ((fr.requester_id = auth.uid() and fr.addressee_id =
--     <friend>) or (fr.addressee_id = auth.uid() and fr.requester_id =
--     <friend>)))` shape get_friend_profile uses. Here the FROM clause is
--     already that accepted row (the function only ever walks friend_requests
--     rows where the caller is a party and status = 'accepted'), so the
--     explicit `exists (...)` in the WHERE is deliberately redundant -- it is
--     kept verbatim so this RPC's friendship gate reads and audits identically
--     to the other three, and so a future refactor of the FROM clause cannot
--     silently widen visibility.
--   * `health_events` exposure is `type` + `occurred_at` ONLY, only within the
--     last 3 days, and NEVER `metadata` (which can carry meal photos, exact
--     macros, workout notes, screen-time totals). This RPC adds NO policy and
--     makes NO RLS change to `health_events` -- it stays strictly author-only
--     (`for all using (auth.uid() = user_id)`), exactly as
--     20260908120000_friend_activity_status.sql left it. The 3-day window means
--     a friend's card can never grow into a long-run activity log of someone
--     else.
--   * The friend's `pets` row is returned whole, as `to_jsonb(p.*)`. That is
--     acceptable: the existing "Friends view accepted friend pets" SELECT
--     policy on public.pets (20260904120000_friends.sql) already grants an
--     accepted friend read access to every column of that pet. This RPC only
--     batches a read the caller could already make one friend at a time via
--     `select * from public.pets where user_id = <friend>` -- it grants nothing
--     new. The client (mobile/src/services/friendsService.ts `toPetState`)
--     already maps that snake_case row shape.
--
-- Additive only: no table, policy, index, function, or grant defined earlier is
-- dropped, replaced, or weakened here. The one `create or replace` is of this
-- new function itself (idempotent re-run of this migration).
--
-- No new table and no new index. The three access paths this function joins are
-- all already indexed for exactly the shape used here:
--   * friend_requests_requester_idx / friend_requests_addressee_idx
--     (20260904120000_friends.sql) cover the `requester_id = auth.uid() or
--     addressee_id = auth.uid()` scan of the caller's accepted rows.
--   * friend_requests_active_pair guarantees at most one pending/accepted row
--     per unordered pair, so the FROM clause yields exactly one row per friend
--     (no row fan-out, no DISTINCT needed).
--   * health_events_user_occurred_idx (user_id, occurred_at desc) from
--     20260828170000_initial_schema.sql fits the per-friend
--     `where user_id = ... and occurred_at >= ... order by occurred_at desc
--     limit 1` lateral exactly.
--   * pets is looked up by `user_id` (primary-key-adjacent; the old
--     one_pet_per_user unique index was dropped in
--     20260907120000_care_partners.sql because a user can now own up to two
--     `pets` rows -- so this picks the most recent by `created_at desc`,
--     mirroring `loadFriendPet` in friendsService.ts).

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
    prof.display_name,
    -- Correlated scalar subquery: exactly one jsonb value (or null) per friend,
    -- so a friend who owns two `pets` rows does not fan this row out. Newest
    -- `pets` row wins, matching friendsService.ts `loadFriendPet`.
    (
      select to_jsonb(p.*)
      from public.pets p
      where p.user_id = f.friend_id
      order by p.created_at desc
      limit 1
    ) as pet,
    act.type as last_activity_type,
    act.occurred_at as last_activity_at,
    f.friends_since
  from (
    -- The caller's accepted friendships, resolved to "the other party" and the
    -- moment the two accounts became friends. friend_requests_active_pair keeps
    -- this to one row per friend.
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
  -- Left join so a friend whose profile row is somehow missing still appears in
  -- the list (with null username/display_name) rather than silently vanishing.
  left join public.profiles prof on prof.id = f.friend_id
  -- One privacy-safe activity signal (type + timestamp only), last 3 days, or
  -- nulls. `limit 1` in the lateral keeps this to one row per friend.
  left join lateral (
    select he.type, he.occurred_at
    from public.health_events he
    where he.user_id = f.friend_id
      and he.occurred_at >= now() - interval '3 days'
    order by he.occurred_at desc
    limit 1
  ) act on true
  -- Redundant with the FROM clause above (see header) -- kept verbatim so the
  -- friendship gate is textually identical to get_friend_profile /
  -- get_friend_recent_activity.
  where exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = auth.uid() and fr.addressee_id = f.friend_id)
        or (fr.addressee_id = auth.uid() and fr.requester_id = f.friend_id))
  )
  order by f.friends_since desc;
$$;

revoke all on function public.get_friends_overview() from public;
grant execute on function public.get_friends_overview() to authenticated;
