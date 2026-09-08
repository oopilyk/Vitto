-- Lets a person keep two pets: the one they adopted, and one shared with someone
-- else. Every care moment feeds both — the app fans a single logged moment out to
-- each pet the user is a member of — so the second pet costs no extra logging.
--
-- Replaces the one-membership rule from 20260907120000. That rule made joining a
-- partner's pet mean abandoning your own, which is why `redeem_pet_invite` had to
-- ask for `p_confirm_leave` first.

-- A partial unique index can enforce "at most one" but not "at most two", so the
-- cap moves to a trigger. Checked on insert and on un-leaving (left_at -> null),
-- which is how `redeem_pet_invite` re-joins someone who left before.
drop index if exists public.one_active_pet_membership_per_user;

create or replace function public.enforce_pet_membership_cap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  active_count integer;
begin
  if new.left_at is not null then
    return new;
  end if;

  select count(*) into active_count
  from public.pet_members
  where user_id = new.user_id
    and left_at is null
    and pet_id <> new.pet_id;

  if active_count >= 2 then
    raise exception using message = 'TOO_MANY_PETS';
  end if;

  return new;
end;
$$;

drop trigger if exists pet_members_cap on public.pet_members;
create trigger pet_members_cap
  before insert or update of left_at, user_id on public.pet_members
  for each row execute function public.enforce_pet_membership_cap();

-- Joining no longer displaces the pet you already have. `p_confirm_leave` is kept
-- so existing callers still type-check, and still means "make room": it only does
-- anything once the caller is at the cap.
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
  caller_pets integer;
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

  -- Only at the cap does anything have to give.
  select count(*) into caller_pets
  from public.pet_members
  where user_id = caller and left_at is null;
  if caller_pets >= 2 then
    if not p_confirm_leave then
      raise exception using message = 'HAS_ACTIVE_PET';
    end if;
    perform public.leave_pet_for(caller);
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
