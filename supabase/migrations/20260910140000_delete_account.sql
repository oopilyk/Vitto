-- Deleting your own account.
--
-- One RPC, because the caller cannot do this themselves: `auth.users` is not
-- reachable from an anon/authenticated client, and the cascade below has to
-- happen in the same transaction as the delete.
--
-- Almost everything the user owns is cleaned up by `on delete cascade` from
-- `auth.users`: their profile, health events, solo pets, friend requests,
-- memberships, invites and care-log rows all reference it.
--
-- The exception is a SHARED pet the caller created. `pets.user_id` cascades, so
-- deleting the creator would delete the pet out from under the partner still
-- caring for it -- the exact thing `leave_pet_for` was written to prevent ("a
-- creator who left cannot pull the pet out from under the partner they handed
-- it to"). So before the delete, any pet the caller created that still has
-- another active member is re-pointed at that member.
--
-- Two deliberate notes on that transfer:
--
--   * `pets.user_id` normally means "who adopted it" and is pinned immutable by
--     `bump_pet_version`. This is the one sanctioned exception -- the row must
--     belong to someone or the FK takes it -- so the trigger is told to allow
--     it through a transaction-local setting, the same mechanism
--     `redeem_pet_invite` uses for `pet_invites`.
--   * The survivor's membership role is NOT promoted to 'owner'. Under the
--     one-owned-one-joint rule (20260909150000) that would be a second owned
--     pet for them if they already have their own, and the cap trigger would
--     reject it. The pet stays in their joint slot, ownerless, which is exactly
--     what happens today when an owner leaves.

create or replace function public.bump_pet_version()
returns trigger
language plpgsql
as $$
begin
  -- `delete_my_account` re-points a shared pet at its surviving carer; nothing
  -- else may ever change the creator. See that function for why.
  if new.user_id is distinct from old.user_id
     and coalesce(current_setting('vitto.transfer_pet', true), '') <> 'on' then
    raise exception using message = 'CREATOR_IS_IMMUTABLE';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  shared_pet record;
  survivor uuid;
begin
  if caller is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;

  -- Hand over any shared pet this user created, so the other carer keeps it.
  for shared_pet in
    select p.id from public.pets p where p.user_id = caller
  loop
    select m.user_id into survivor
    from public.pet_members m
    where m.pet_id = shared_pet.id
      and m.user_id <> caller
      and m.left_at is null
    order by m.joined_at asc, m.user_id asc
    limit 1;

    if survivor is not null then
      perform set_config('vitto.transfer_pet', 'on', true);
      update public.pets set user_id = survivor where id = shared_pet.id;
      perform set_config('vitto.transfer_pet', '', true);
    end if;
  end loop;

  -- Everything else goes with the user row.
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
