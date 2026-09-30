-- Hand a shared pet over whenever its creator is deleted, however that happens.
--
-- `pets.user_id` is `on delete cascade` from `auth.users`, so deleting the
-- person who ADOPTED a shared pet takes the pet with them -- out from under the
-- partner who is still caring for it, and with it every health event, care-log
-- row and companion memory attached to that pet.
--
-- `delete_my_account` (20260910140000) already prevents that, by re-pointing
-- such a pet at its surviving carer before the delete. But it only protects the
-- one path that goes through the app. A user deleted from the Supabase
-- dashboard, through the Admin API, or with plain SQL never calls it, and
-- Postgres simply cascades. That is not a hypothetical: removing a collaborator
-- is exactly the kind of housekeeping done from the dashboard, and the pet they
-- adopted is the one the other person still uses every day.
--
-- So the rule moves to where it cannot be bypassed: a BEFORE DELETE trigger on
-- `auth.users`, which runs no matter who is doing the deleting or how. The
-- table already carries `on_auth_user_created` (20260828170000), so a trigger
-- here is the established shape in this schema, not a new kind of thing.
--
-- `delete_my_account` is deliberately left alone. Its loop now runs first and
-- transfers the pet, after which this trigger finds nothing left to move --
-- idempotent, harmless, and one less working function rewritten for no reason.

create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  shared_pet record;
  survivor uuid;
begin
  -- Only pets this person ADOPTED are at risk: a pet they merely joined is
  -- someone else's row, and their `pet_members` row cascades on its own.
  for shared_pet in
    select p.id from public.pets p where p.user_id = old.id
  loop
    -- The longest-standing other carer still on the pet. Ordered so the choice
    -- is deterministic rather than whatever the planner returns first, matching
    -- `delete_my_account`.
    select m.user_id into survivor
    from public.pet_members m
    where m.pet_id = shared_pet.id
      and m.user_id <> old.id
      and m.left_at is null
    order by m.joined_at asc, m.user_id asc
    limit 1;

    -- Nobody left: the pet was theirs alone, and the cascade may have it.
    if survivor is not null then
      -- `bump_pet_version` pins `user_id` immutable (CREATOR_IS_IMMUTABLE).
      -- This is the sanctioned exception -- the row must belong to somebody or
      -- the FK takes it -- opened through the same transaction-local setting
      -- `delete_my_account` and `redeem_pet_invite` use.
      perform set_config('vitto.transfer_pet', 'on', true);
      update public.pets set user_id = survivor where id = shared_pet.id;
      perform set_config('vitto.transfer_pet', '', true);
    end if;
  end loop;

  return old;
end;
$$;

-- Not granted to anyone: a trigger function is invoked by the trigger, and
-- `returns trigger` cannot be called directly anyway.
revoke all on function public.handle_user_deleted() from public, anon, authenticated;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_deleted();

-- The survivor's membership role is NOT promoted to 'owner', for the reason
-- 20260910140000 gives: under the one-owned-one-joint rule that would be a
-- second owned pet for someone who already has their own, and the membership
-- cap would reject it. The pet stays in their joint slot, ownerless -- the same
-- state as when an owner simply leaves.
