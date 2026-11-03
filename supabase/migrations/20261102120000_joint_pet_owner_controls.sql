-- Joint pets: the owner is in charge of their pet, in life and in deletion.
--
-- 1. Deleting your account deletes the pet you adopted, shared or not. It used
--    to be handed to the partner instead (20260910140000, 20260928120000), by
--    re-pointing `pets.user_id` at them. But `user_id` is what every client
--    reads as "my own pet", so the partner suddenly appeared to own two pets:
--    the handed-over one showed the owner's card, with no way to leave it, and
--    it could be picked over the pet they actually adopted. Now the cascade
--    from `auth.users` simply takes the pet, with its memberships, invites,
--    care log and companion memory. The partner's joint slot frees up.
-- 2. `remove_pet_member`: the owner can remove their care partner. Same effect
--    as the partner leaving: their membership closes, the pet and its history
--    stay with the owner, and any code the partner minted is revoked.
-- 3. A one-time repair for pets already handed over: the partner who received
--    one is moved out of it, the same as if they had pressed Leave. Nothing is
--    deleted -- the pet row stays, just with no active carer -- so this is
--    reversible by clearing `left_at` on that membership.
--
-- Every statement is safe to re-run.

-- 1. Account deletion takes the adopted pet ---------------------------------

drop trigger if exists on_auth_user_deleted on auth.users;
drop function if exists public.handle_user_deleted();

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;

  -- The waitlist is keyed by email, not by user, so it does not cascade.
  delete from public.waitlist w
  using auth.users u
  where u.id = caller and u.email is not null and w.email_normalized = lower(btrim(u.email));

  -- Everything else goes with the user row: their pet (shared or not) and
  -- everything hanging off it, and their seat on anyone else's pet.
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 2. The owner can remove their partner -------------------------------------

create or replace function public.remove_pet_member(p_pet_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;

  -- Only the person who adopted the pet, and still holds it as its owner.
  if not exists (
    select 1
    from public.pets p
    join public.pet_members m on m.pet_id = p.id and m.user_id = caller
    where p.id = p_pet_id and p.user_id = caller and m.role = 'owner' and m.left_at is null
  ) then
    raise exception using message = 'NOT_THE_OWNER';
  end if;

  if p_user_id = caller or not exists (
    select 1 from public.pet_members
    where pet_id = p_pet_id and user_id = p_user_id and role = 'partner' and left_at is null
  ) then
    raise exception using message = 'NOT_A_MEMBER';
  end if;

  perform public.leave_pet_for(p_user_id, p_pet_id);
end;
$$;

revoke all on function public.remove_pet_member(uuid, uuid) from public, anon;
grant execute on function public.remove_pet_member(uuid, uuid) to authenticated;

-- 3. Unstick pets already handed over ----------------------------------------

-- A handed-over pet is one whose `user_id` points at someone who only ever
-- held it as a partner: the original owner's account is gone.
update public.pet_members m
set left_at = now()
from public.pets p
where p.id = m.pet_id
  and m.user_id = p.user_id
  and m.role = 'partner'
  and m.left_at is null;
