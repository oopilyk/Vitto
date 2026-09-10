-- Two pets, with a shape: the one you adopted, plus at most one you were invited
-- to. The second slot is only ever a joint pet, and the only way to free it is to
-- leave that joint pet.
--
-- 20260907140000 lifted the cap to two memberships but left three things from
-- the one-pet era in place, which is why joint care never actually worked:
--
--   * `leave_pet()` took no pet id. With two active memberships it closed
--     whichever row `select ... limit` happened to return -- so "leave the
--     shared pet" could just as easily drop the pet you adopted.
--   * `redeem_pet_invite` still "made room" by leaving a pet for you when at the
--     cap. Joining is never allowed to cost you a pet now; at the cap it refuses
--     and tells you to leave your joint pet first.
--   * The cap was a bare count. Two adopted pets, or two joint pets, both passed.
--     It is now one OWNED membership and one PARTNER membership, which is the
--     rule the product actually has.
--
-- An owner who leaves no longer hands the pet to the partner. Promotion would
-- give the partner a second owned pet, which the rule above forbids; the pet
-- simply stays in their joint slot, ownerless, until they leave it too.
--
-- Every statement is safe to re-run.

-- a. Cap: one owned, one joint ----------------------------------------------

create or replace function public.enforce_pet_membership_cap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  same_role integer;
begin
  if new.left_at is not null then
    return new;
  end if;

  select count(*) into same_role
  from public.pet_members
  where user_id = new.user_id
    and role = new.role
    and left_at is null
    and pet_id <> new.pet_id;

  if same_role >= 1 then
    if new.role = 'owner' then
      raise exception using message = 'ALREADY_OWNS_PET';
    end if;
    raise exception using message = 'HAS_JOINT_PET';
  end if;

  return new;
end;
$$;

drop trigger if exists pet_members_cap on public.pet_members;
create trigger pet_members_cap
  before insert or update of left_at, user_id, role on public.pet_members
  for each row execute function public.enforce_pet_membership_cap();

-- b. Leaving names the pet ----------------------------------------------------

drop function if exists public.leave_pet_for(uuid);
drop function if exists public.leave_pet();

-- Private: closes `p_user`'s membership of ONE pet. Not granted to
-- `authenticated`; only `leave_pet` calls it.
create or replace function public.leave_pet_for(p_user uuid, p_pet_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  membership public.pet_members%rowtype;
begin
  select * into membership
  from public.pet_members
  where user_id = p_user and pet_id = p_pet_id and left_at is null
  for update;
  if not found then
    raise exception using message = 'NOT_A_MEMBER';
  end if;

  update public.pet_members
  set left_at = now()
  where pet_id = p_pet_id and user_id = p_user;

  -- A code minted by someone who has left must not still open the door.
  update public.pet_invites
  set revoked_at = now()
  where pet_id = p_pet_id
    and created_by = p_user
    and redeemed_at is null
    and revoked_at is null;
end;
$$;
revoke all on function public.leave_pet_for(uuid, uuid) from public, anon, authenticated;

create or replace function public.leave_pet(p_pet_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;
  perform public.leave_pet_for(auth.uid(), p_pet_id);
end;
$$;
revoke all on function public.leave_pet(uuid) from public, anon;
grant execute on function public.leave_pet(uuid) to authenticated;

-- c. Joining never costs you a pet --------------------------------------------

-- `p_confirm_leave` is kept so existing callers still type-check, but it no
-- longer does anything: there is nothing it is allowed to leave on your behalf.
create or replace function public.redeem_pet_invite(p_code text, p_confirm_leave boolean default false)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  invite public.pet_invites%rowtype;
  active_count integer;
begin
  if caller is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;

  select * into invite
  from public.pet_invites
  where code = normalized
  for update;
  if not found then
    raise exception using message = 'INVITE_NOT_FOUND';
  end if;
  if invite.redeemed_at is not null then
    raise exception using message = 'INVITE_USED';
  end if;
  if invite.revoked_at is not null or invite.expires_at < now() then
    raise exception using message = 'INVITE_EXPIRED';
  end if;

  -- Serialise redemptions per pet so two codes for the same pet cannot both
  -- pass the member-count check at once.
  perform 1 from public.pets where id = invite.pet_id for update;

  if not exists (
    select 1 from public.pet_members
    where pet_id = invite.pet_id and user_id = invite.created_by and role = 'owner' and left_at is null
  ) then
    raise exception using message = 'INVITE_EXPIRED';
  end if;
  if invite.created_by = caller then
    raise exception using message = 'OWN_INVITE';
  end if;
  if exists (
    select 1 from public.pet_members
    where pet_id = invite.pet_id and user_id = caller and left_at is null
  ) then
    raise exception using message = 'ALREADY_MEMBER';
  end if;

  select count(*) into active_count
  from public.pet_members
  where pet_id = invite.pet_id and left_at is null;
  if active_count >= 2 then
    raise exception using message = 'PET_FULL';
  end if;

  -- The joint slot is taken. Refuse with a clear code rather than letting the
  -- cap trigger raise on the insert below -- same outcome, better message, and
  -- checked before anything is written.
  if exists (
    select 1 from public.pet_members
    where user_id = caller and role = 'partner' and left_at is null
  ) then
    raise exception using message = 'HAS_JOINT_PET';
  end if;

  insert into public.pet_members (pet_id, user_id, role)
  values (invite.pet_id, caller, 'partner')
  on conflict (pet_id, user_id) do update
    set left_at = null, role = 'partner', joined_at = now();

  -- See guard_pet_invite_update: only this RPC may mark a code redeemed.
  perform set_config('vitto.invite_rpc', 'on', true);
  update public.pet_invites
  set redeemed_at = now(), redeemed_by = caller
  where id = invite.id;
  perform set_config('vitto.invite_rpc', '', true);

  return invite.pet_id;
end;
$$;
revoke all on function public.redeem_pet_invite(text, boolean) from public, anon;
grant execute on function public.redeem_pet_invite(text, boolean) to authenticated;
