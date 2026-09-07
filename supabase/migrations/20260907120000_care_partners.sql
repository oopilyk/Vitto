-- Care partners: two people raising one pet.
--
-- Membership moves out of `pets.user_id` (which keeps meaning "who adopted it")
-- into `pet_members`, so either member can read and care for the pet. The old
-- `one_pet_per_user` index has to go: someone who leaves a shared pet and adopts
-- a new one legitimately owns two `pets` rows. Its replacement is a partial
-- unique index on ACTIVE memberships, which is the rule we actually want.
--
-- Concurrency is optimistic: `pets.version` is bumped by a trigger on every
-- update and clients write `update ... where id = ? and version = ?`, reloading
-- and recomputing on zero rows. Clients never send `version` themselves.
--
-- Privacy: a partner only ever learns an event TYPE and a time (`pet_care_log`
-- has no label, notes or metadata columns on purpose) plus a display name that
-- `get_pet_members` refuses to return when it is blank or looks like an email --
-- `handle_new_user` falls back to the sign-up email, so most names start out as
-- one. `health_events` stays author-only and is not touched here.
--
-- Every statement is safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- (before the helper below: a `language sql` body is validated at creation and
--  must be able to see `pet_members`)
-- ---------------------------------------------------------------------------

create table if not exists public.pet_members (
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'partner')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (pet_id, user_id)
);
create index if not exists pet_members_user_idx on public.pet_members(user_id);

create table if not exists public.pet_invites (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  -- Same alphabet as INVITE_CODE_ALPHABET in packages/core (no 0/O/1/I).
  code text not null check (code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);
create unique index if not exists pet_invites_code_idx on public.pet_invites(code);
create index if not exists pet_invites_pet_idx on public.pet_invites(pet_id);

-- The list must stay in step with HEALTH_EVENT_TYPES in
-- packages/core/src/domain/health.ts; `health.test.ts` reads this file back.
create table if not exists public.pet_care_log (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('STEP_ACTIVITY', 'WORKOUT', 'MEAL', 'BRAIN_TRAINING', 'SLEEP', 'SCREEN_TIME', 'HYDRATION', 'MANUAL_ACTIVITY')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists pet_care_log_pet_occurred_idx on public.pet_care_log(pet_id, occurred_at desc);

alter table public.pets add column if not exists version integer not null default 0;

-- ---------------------------------------------------------------------------
-- Helper
-- SECURITY DEFINER so the `pet_members` policies can call it without recursing
-- into themselves.
-- ---------------------------------------------------------------------------

create or replace function public.is_active_pet_member(p_pet_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.pet_members
    where pet_id = p_pet_id and user_id = auth.uid() and left_at is null
  );
$$;
revoke all on function public.is_active_pet_member(uuid) from public, anon;
grant execute on function public.is_active_pet_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill, then swap the uniqueness rule
-- ---------------------------------------------------------------------------

insert into public.pet_members (pet_id, user_id, role, joined_at)
select id, user_id, 'owner', created_at from public.pets
on conflict (pet_id, user_id) do nothing;

create unique index if not exists one_active_pet_membership_per_user
  on public.pet_members(user_id) where left_at is null;

drop index if exists public.one_pet_per_user;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Adoption creates the owner membership, so adoption code and the web app do
-- not change. A second active membership hits the partial unique index and
-- rolls the adoption back (23505), which is the right answer.
create or replace function public.handle_new_pet()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.pet_members (pet_id, user_id, role, joined_at)
  values (new.id, new.user_id, 'owner', new.created_at)
  on conflict (pet_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_pet_created on public.pets;
create trigger on_pet_created
  after insert on public.pets
  for each row execute procedure public.handle_new_pet();

-- Bumped on every update regardless of what the client sent, so the web's
-- whole-row upsert advances it too and mobile clients notice the change.
--
-- Also pins `user_id`: the UPDATE policy admits any active member, and the
-- DELETE policy keys on the creator, so letting a partner rewrite `user_id`
-- would let them take over and delete the shared pet. Nobody, creator
-- included, has a reason to change it.
create or replace function public.bump_pet_version()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using message = 'CREATOR_IS_IMMUTABLE';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

-- pet_invites: the creator's UPDATE policy exists only so a code can be
-- revoked. Without this guard it would also let them null out `redeemed_at`
-- and re-arm a used single-use code, or move `expires_at`. Only `revoked_at`
-- may change, and only from null to a timestamp. `redeem_pet_invite` is the one
-- legitimate writer of `redeemed_at`/`redeemed_by`; it announces itself through
-- a transaction-local setting (`vitto.invite_rpc`) that no client can set
-- ahead of a PostgREST request, because each request runs in its own
-- transaction and the setting is cleared when it ends.
create or replace function public.guard_pet_invite_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('vitto.invite_rpc', true), '') = 'on' then
    return new;
  end if;
  if new.id is distinct from old.id
    or new.pet_id is distinct from old.pet_id
    or new.created_by is distinct from old.created_by
    or new.code is distinct from old.code
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
    or new.redeemed_at is distinct from old.redeemed_at
    or new.redeemed_by is distinct from old.redeemed_by
    or (new.revoked_at is distinct from old.revoked_at
        and not (old.revoked_at is null and new.revoked_at is not null))
  then
    raise exception using message = 'INVITE_IS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists pet_invites_guard_update on public.pet_invites;
create trigger pet_invites_guard_update
  before update on public.pet_invites
  for each row execute procedure public.guard_pet_invite_update();

drop trigger if exists pets_bump_version on public.pets;
create trigger pets_bump_version
  before update on public.pets
  for each row execute procedure public.bump_pet_version();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- pets: members read and update; only the creator inserts (so `upsert` is an
-- adoption-only path from now on) or deletes -- and only while still an active
-- member, so a creator who left cannot pull the pet out from under the
-- partner they handed it to. No client path deletes today.
drop policy if exists "Users manage their pet" on public.pets;
drop policy if exists "Members read their pet" on public.pets;
create policy "Members read their pet" on public.pets
  for select using (public.is_active_pet_member(id));
drop policy if exists "Users adopt their pet" on public.pets;
create policy "Users adopt their pet" on public.pets
  for insert with check (auth.uid() = user_id);
drop policy if exists "Members update their pet" on public.pets;
create policy "Members update their pet" on public.pets
  for update using (public.is_active_pet_member(id)) with check (public.is_active_pet_member(id));
drop policy if exists "Creators delete their pet" on public.pets;
create policy "Creators delete their pet" on public.pets
  for delete using (auth.uid() = user_id and public.is_active_pet_member(id));

-- pet_members: read your own rows and your co-members. No insert/update/delete
-- policies on purpose -- only the trigger and the SECURITY DEFINER RPCs write.
alter table public.pet_members enable row level security;
drop policy if exists "Members see co-members" on public.pet_members;
create policy "Members see co-members" on public.pet_members
  for select using (user_id = auth.uid() or public.is_active_pet_member(pet_id));

-- pet_invites: only an active owner can mint one; only its creator can see or
-- revoke it. Redemption goes through the RPC, never through a direct update.
alter table public.pet_invites enable row level security;
drop policy if exists "Creators read their invites" on public.pet_invites;
create policy "Creators read their invites" on public.pet_invites
  for select using (created_by = auth.uid());
drop policy if exists "Owners create invites" on public.pet_invites;
create policy "Owners create invites" on public.pet_invites
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.pet_members
      where pet_id = pet_invites.pet_id and user_id = auth.uid() and role = 'owner' and left_at is null
    )
  );
drop policy if exists "Creators revoke their invites" on public.pet_invites;
create policy "Creators revoke their invites" on public.pet_invites
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

-- pet_care_log: members read; a member writes only rows attributed to themself.
alter table public.pet_care_log enable row level security;
drop policy if exists "Members read the care log" on public.pet_care_log;
create policy "Members read the care log" on public.pet_care_log
  for select using (public.is_active_pet_member(pet_id));
drop policy if exists "Members write their own care log" on public.pet_care_log;
create policy "Members write their own care log" on public.pet_care_log
  for insert with check (user_id = auth.uid() and public.is_active_pet_member(pet_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- Each failure raises with a bare code as the message; the client maps it to
-- copy (inviteErrorMessage in packages/core).
-- ---------------------------------------------------------------------------

-- Private: closes `p_user`'s active membership, if any. Not granted to
-- `authenticated`; only `leave_pet` and `redeem_pet_invite` call it.
create or replace function public.leave_pet_for(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  membership public.pet_members%rowtype;
  successor uuid;
begin
  select * into membership
  from public.pet_members
  where user_id = p_user and left_at is null
  for update;
  if not found then
    return;
  end if;

  update public.pet_members
  set left_at = now()
  where pet_id = membership.pet_id and user_id = p_user;

  -- An owner leaving hands the pet to whoever has been there longest.
  if membership.role = 'owner' then
    select user_id into successor
    from public.pet_members
    where pet_id = membership.pet_id and left_at is null
    order by joined_at asc, user_id asc
    limit 1
    for update;
    if successor is not null then
      update public.pet_members
      set role = 'owner'
      where pet_id = membership.pet_id and user_id = successor;
    end if;
  end if;

  -- A code minted by someone who has left must not still open the door.
  update public.pet_invites
  set revoked_at = now()
  where pet_id = membership.pet_id
    and created_by = p_user
    and redeemed_at is null
    and revoked_at is null;
end;
$$;
revoke all on function public.leave_pet_for(uuid) from public, anon, authenticated;

create or replace function public.leave_pet()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;
  perform public.leave_pet_for(auth.uid());
end;
$$;
revoke all on function public.leave_pet() from public, anon;
grant execute on function public.leave_pet() to authenticated;

-- Joins the caller to the invite's pet and returns that pet's id. Joining with
-- a pet already in hand is allowed only with `p_confirm_leave`, so a stale
-- client cannot orphan a pet by accident; the old pet row is never deleted.
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

  if exists (select 1 from public.pet_members where user_id = caller and left_at is null) then
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

-- Every member of a pet, including ones who left (so old care-log rows still
-- resolve to a name). The display name is the only thing exposed about another
-- person, and it is withheld when blank or when it looks like an email.
create or replace function public.get_pet_members(p_pet_id uuid)
returns table (user_id uuid, role text, joined_at timestamptz, left_at timestamptz, display_name text)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_active_pet_member(p_pet_id) then
    raise exception using message = 'NOT_A_MEMBER';
  end if;
  return query
    select
      m.user_id,
      m.role,
      m.joined_at,
      m.left_at,
      case
        when p.display_name is null or btrim(p.display_name) = '' or p.display_name like '%@%' then null
        else left(btrim(p.display_name), 40)
      end
    from public.pet_members m
    left join public.profiles p on p.id = m.user_id
    where m.pet_id = p_pet_id
    order by m.joined_at asc, m.user_id asc;
end;
$$;
revoke all on function public.get_pet_members(uuid) from public, anon;
grant execute on function public.get_pet_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Stretch (not required): push pet changes to partners over Supabase Realtime
-- instead of polling on foreground. Enable by hand when the client listens.
-- ---------------------------------------------------------------------------
-- alter publication supabase_realtime add table public.pets;
