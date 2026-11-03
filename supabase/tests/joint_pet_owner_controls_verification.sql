-- Manual verification for
-- supabase/migrations/20261102120000_joint_pet_owner_controls.sql.
--
-- Like the other files here this is a scratch script, NOT a migration -- run it
-- by hand against a local or disposable Supabase instance. NEVER run it against
-- production: it inserts and deletes rows in auth.users.
--
-- What it proves, in one transaction that is rolled back at the end:
--
--   1. Only the owner can remove a partner, and removing closes the seat.
--   2. Deleting the owner of a SHARED pet deletes the pet, and the partner's
--      seat with it, instead of handing it over.
--
-- Run as postgres / service_role.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'joint-owner@example.test', '', now(), now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'joint-partner@example.test', '', now(), now(), now());

-- `on_pet_created` gives the creator an 'owner' membership.
insert into public.pets (id, user_id, name, species)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Shared', 'cat');
insert into public.pet_members (pet_id, user_id, role, joined_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'partner', now());

-- ---------------------------------------------------------------------------
-- 1. Removing a partner.
-- ---------------------------------------------------------------------------

-- The partner cannot remove the owner. EXPECT: 'NOT_THE_OWNER'.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  perform public.remove_pet_member('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
  raise notice 'FAIL: partner removed the owner';
exception when others then
  raise notice 'partner refused: %', sqlerrm;
end;
$$;

-- The owner removes the partner.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select public.remove_pet_member('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002');
reset role;

-- EXPECT: true. The pet itself is untouched.
select
  'partner seat closed' as check,
  (select left_at is not null from public.pet_members
     where pet_id = 'bbbbbbbb-0000-0000-0000-000000000001' and user_id = 'aaaaaaaa-0000-0000-0000-000000000002') as closed,
  (select count(*) from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001') as pet_rows;

-- ---------------------------------------------------------------------------
-- 2. Deleting the owner of a shared pet.
-- ---------------------------------------------------------------------------

-- Seat the partner again, then delete the owner the way the dashboard would.
update public.pet_members set left_at = null
where pet_id = 'bbbbbbbb-0000-0000-0000-000000000001' and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- EXPECT: 0 and 0. The pet went with its owner; the partner's seat went with it.
select
  'shared pet deleted with its owner' as check,
  (select count(*) from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001') as pet_rows,
  (select count(*) from public.pet_members where pet_id = 'bbbbbbbb-0000-0000-0000-000000000001') as seats;

rollback;
