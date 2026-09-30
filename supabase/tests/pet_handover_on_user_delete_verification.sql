-- Manual verification for the shared-pet handover added by
-- supabase/migrations/20260928120000_pet_handover_on_user_delete.sql.
--
-- Like the other files here this is a scratch script, NOT a migration -- run it
-- by hand against a local or disposable Supabase instance. NEVER run it against
-- production: it inserts and deletes rows in auth.users.
--
-- What it proves, in one transaction that is rolled back at the end:
--
--   1. Deleting the creator of a SHARED pet hands the pet to the surviving
--      carer instead of cascading it away.
--   2. The survivor's membership role is NOT promoted (see the migration).
--   3. Deleting the owner of a SOLO pet still cascades, as it should.
--
-- Background: `pets.user_id` is `on delete cascade` from `auth.users`, so
-- before this trigger, removing a collaborator from the Supabase dashboard
-- silently deleted any shared pet they had adopted -- along with every health
-- event, care-log row and companion memory hanging off it. `delete_my_account`
-- guarded only the in-app path; the dashboard, the Admin API and plain SQL all
-- went straight to the cascade.
--
-- Run as postgres / service_role.

begin;

-- ---------------------------------------------------------------------------
-- 0. Two throwaway users: `creator` adopts, `partner` joins.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'handover-creator@example.test', '', now(), now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'handover-partner@example.test', '', now(), now(), now());

-- The shared pet. `on_pet_created` gives the creator an 'owner' membership.
insert into public.pets (id, user_id, name, species)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Shared', 'cat');

-- The partner joins.
insert into public.pet_members (pet_id, user_id, role, joined_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'partner', now());

-- A solo pet belonging to the partner, to prove the cascade still works.
insert into public.pets (id, user_id, name, species)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Solo', 'dog');

-- ---------------------------------------------------------------------------
-- 1. Delete the creator. This is what the dashboard does.
-- ---------------------------------------------------------------------------
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- EXPECT: one row, user_id now the partner. Before the trigger: zero rows.
select
  'shared pet survived and transferred' as check,
  (select count(*) from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001') as pet_rows,
  (select user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
     from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001') as belongs_to_partner;

-- EXPECT: 'partner'. The role is deliberately NOT promoted to 'owner' -- under
-- the one-owned-one-joint rule that would be a second owned pet for someone who
-- already has their own, and the membership cap would reject it.
select
  'survivor role left alone' as check,
  role
from public.pet_members
where pet_id = 'bbbbbbbb-0000-0000-0000-000000000001'
  and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- 2. A pet with nobody left still cascades.
-- ---------------------------------------------------------------------------
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- EXPECT: 0 and 0. The partner was the last carer of both, so both go.
select
  'solo pet cascaded as before' as check,
  (select count(*) from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000002') as solo_rows,
  (select count(*) from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001') as shared_rows;

-- ---------------------------------------------------------------------------
-- 3. Leave nothing behind.
-- ---------------------------------------------------------------------------
rollback;
