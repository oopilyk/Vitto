-- Manual RLS verification for the "Friends & Social Pets" migration
-- (supabase/migrations/20260904120000_friends.sql).
--
-- This repo has no pgTAP / automated Supabase RLS test harness yet, so this
-- is a scratch script, NOT a migration -- run it by hand (psql / Supabase SQL
-- editor) against a local/disposable Supabase instance to confirm the policy
-- behavior below. Never run it against production data: it inserts and
-- deletes rows in auth.users.
--
-- Pattern: as the postgres/service-role user, create two throwaway auth
-- users, then use `set local role authenticated; set local
-- request.jwt.claims = ...;` (or `select auth.uid()` shims, depending on
-- your local Supabase setup) to impersonate each one and check what RLS
-- allows. Adjust the impersonation snippet to whatever your local stack
-- supports (Supabase CLI's `supabase db` exposes `auth.uid()` via
-- `request.jwt.claim.sub`).

-- ---------------------------------------------------------------------------
-- 0. Setup: two users, A and B, each with a profile + pet.
-- ---------------------------------------------------------------------------

-- (Run as postgres/service_role.)
-- insert into auth.users (id, email) values
--   ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
--   ('22222222-2222-2222-2222-222222222222', 'b@example.com');
--
-- update public.profiles set username = 'user_a', display_name = 'User A'
--   where id = '11111111-1111-1111-1111-111111111111';
-- update public.profiles set username = 'user_b', display_name = 'User B'
--   where id = '22222222-2222-2222-2222-222222222222';
--
-- insert into public.pets (id, user_id, name, species, mood) values
--   ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '11111111-1111-1111-1111-111111111111', 'Ash', 'cat', 'content'),
--   ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', '22222222-2222-2222-2222-222222222222', 'Birch', 'dog', 'content');

-- Helper to impersonate a user in a Supabase CLI local instance:
--   set local role authenticated;
--   set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 1. No friend_requests row at all -> A cannot see B's pet or profile.
-- ---------------------------------------------------------------------------

-- set local role authenticated;
-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- select * from public.pets where user_id = '22222222-2222-2222-2222-222222222222';       -- expect 0 rows
-- select * from public.profiles where id = '22222222-2222-2222-2222-222222222222';        -- expect 0 rows (no
--   friend-scoped SELECT policy exists on profiles at all -- see get_friend_profile below)
-- select * from public.get_friend_profile('22222222-2222-2222-2222-222222222222');        -- expect 0 rows

-- ---------------------------------------------------------------------------
-- 2. A sends a request to B; status = 'pending' -> still no visibility either way.
-- ---------------------------------------------------------------------------

-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- insert into public.friend_requests (id, requester_id, addressee_id)
--   values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
--           '11111111-1111-1111-1111-111111111111',
--           '22222222-2222-2222-2222-222222222222');                                       -- expect success

-- select * from public.pets where user_id = '22222222-2222-2222-2222-222222222222';       -- expect 0 rows (still pending)

-- set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
-- select * from public.pets where user_id = '11111111-1111-1111-1111-111111111111';       -- expect 0 rows

-- ---------------------------------------------------------------------------
-- 3. B accepts -> both directions can now SELECT the other's pet + profile.
-- ---------------------------------------------------------------------------

-- set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
-- update public.friend_requests set status = 'accepted', responded_at = now()
--   where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';                                     -- expect success (addressee, was pending)

-- select * from public.pets where user_id = '11111111-1111-1111-1111-111111111111';       -- expect 1 row (Ash)
-- select * from public.profiles where id = '11111111-1111-1111-1111-111111111111';        -- expect 0 rows (see
--   above -- profiles has no friend SELECT policy; use get_friend_profile instead)
-- select * from public.get_friend_profile('11111111-1111-1111-1111-111111111111');        -- expect 1 row
--   (id, username='user_a', display_name='User A' -- exactly 3 columns, no age/sex/height/weight/activity/goal)

-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- select * from public.pets where user_id = '22222222-2222-2222-2222-222222222222';       -- expect 1 row (Birch) -- symmetry
-- select * from public.get_friend_profile('22222222-2222-2222-2222-222222222222');        -- expect 1 row (User B) -- symmetry

-- ---------------------------------------------------------------------------
-- 4. Insert forgery: A cannot name someone else as requester_id.
-- ---------------------------------------------------------------------------

-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- insert into public.friend_requests (id, requester_id, addressee_id)
--   values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
--           '22222222-2222-2222-2222-222222222222',    -- pretending to be B
--           '11111111-1111-1111-1111-111111111111');
-- -- expect: rejected by RLS (new row violates row-level security policy)

-- ---------------------------------------------------------------------------
-- 4b. Insert forgery: A cannot self-service-insert an already-'accepted' row
--     to skip B's consent entirely (security review finding #1).
-- ---------------------------------------------------------------------------

-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- insert into public.friend_requests (id, requester_id, addressee_id, status)
--   values ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
--           '11111111-1111-1111-1111-111111111111',
--           '22222222-2222-2222-2222-222222222222',
--           'accepted');
-- -- expect: rejected by RLS (new row violates row-level security policy --
-- -- the INSERT policy's WITH CHECK pins status = 'pending')

-- ---------------------------------------------------------------------------
-- 5. Update forgery: only the addressee can respond, and only while pending.
-- ---------------------------------------------------------------------------

-- (Using a fresh third user C sending A a pending request, or re-run step 2
-- with a new pair, to get back to a pending row for this check.)
--
-- As the *requester* (not addressee), attempt to accept your own request:
-- set local request.jwt.claim.sub = '<requester id>';
-- update public.friend_requests set status = 'accepted' where id = '<pending request id>';
-- -- expect: 0 rows updated (USING clause excludes non-addressee)
--
-- As the addressee, attempt to update a request that is already 'accepted' or 'declined':
-- update public.friend_requests set status = 'declined' where id = '<already-accepted id>';
-- -- expect: 0 rows updated (USING clause requires status = 'pending')

-- ---------------------------------------------------------------------------
-- 5b. Update forgery: the addressee cannot rewrite requester_id to forge an
--     'accepted' relationship with an arbitrary third party who never sent or
--     agreed to any request (security review finding #2).
-- ---------------------------------------------------------------------------

-- Setup: a throwaway user S sends A a pending request.
-- set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; -- S
-- insert into public.friend_requests (id, requester_id, addressee_id)
--   values ('b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3',
--           '33333333-3333-3333-3333-333333333333',
--           '11111111-1111-1111-1111-111111111111');                        -- expect success

-- A (the addressee) tries to also rewrite requester_id to V while accepting:
-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; -- A
-- update public.friend_requests
--   set requester_id = '22222222-2222-2222-2222-222222222222', -- V, who never sent anything
--       status = 'accepted', responded_at = now()
--   where id = 'b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3';
-- -- expect: rejected (the friend_requests_lock_identity trigger raises on any
-- -- change to requester_id/addressee_id, independent of the UPDATE policy)

-- ---------------------------------------------------------------------------
-- 6. Duplicate / reciprocal pending or accepted requests are rejected.
-- ---------------------------------------------------------------------------

-- With the accepted A<->B row from step 3 still present:
-- set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
-- insert into public.friend_requests (id, requester_id, addressee_id)
--   values ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
--           '22222222-2222-2222-2222-222222222222',
--           '11111111-1111-1111-1111-111111111111');
-- -- expect: unique_violation on friend_requests_active_pair (reciprocal accepted pair)

-- ---------------------------------------------------------------------------
-- 7. A request re-sent after a prior decline succeeds (declined rows are just history).
-- ---------------------------------------------------------------------------

-- set local role postgres; -- or service_role, to reset state
-- update public.friend_requests set status = 'declined'
--   where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
--
-- set local role authenticated;
-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- insert into public.friend_requests (id, requester_id, addressee_id)
--   values ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1',
--           '11111111-1111-1111-1111-111111111111',
--           '22222222-2222-2222-2222-222222222222');
-- -- expect: success (no unique violation -- prior row is 'declined', excluded by the partial index)

-- ---------------------------------------------------------------------------
-- 8. Either party can delete (cancel a pending request, or unfriend an accepted one).
-- ---------------------------------------------------------------------------

-- set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- addressee, not requester
-- delete from public.friend_requests where id = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
-- -- expect: success (delete policy allows either party)

-- ---------------------------------------------------------------------------
-- 9. search_profiles: minimal projection, excludes self, min length 2.
-- ---------------------------------------------------------------------------

-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- select * from public.search_profiles('user');   -- expect only user_b row (id, username, display_name columns only -- no email/age/etc)
-- select * from public.search_profiles('user_a'); -- expect 0 rows (caller's own row excluded)
-- select * from public.search_profiles('u');      -- expect 0 rows (query shorter than 2 chars)
-- select * from public.search_profiles('user%');  -- expect 0 rows (literal '%' in a real username is vanishingly
--   likely to match nothing anyway, but confirms '%'/'_' are escaped rather than acting as wildcards)

-- Confirm the returned shape has exactly 3 columns (id, username, display_name) for both RPCs:
-- \sf public.search_profiles       (psql) and eyeball the RETURNS TABLE clause.
-- \sf public.get_friend_profile    (psql) and eyeball the RETURNS TABLE clause.

-- ---------------------------------------------------------------------------
-- Cleanup (service_role):
-- ---------------------------------------------------------------------------

-- delete from auth.users where id in (
--   '11111111-1111-1111-1111-111111111111',
--   '22222222-2222-2222-2222-222222222222'
-- ); -- cascades to profiles/pets/friend_requests
