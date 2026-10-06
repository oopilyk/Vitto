-- Security fixes from the October 2026 audit. Each section stands alone.

-- ---------------------------------------------------------------------------
-- 1. Invite codes: made on the server, longer, and not guessable by brute force.
-- ---------------------------------------------------------------------------
-- Codes were 6 characters from Math.random on the client, the client chose
-- their expiry, and redeeming had no limit on attempts -- while its errors
-- told a guesser which codes existed (used / expired vs not found). A script
-- with throwaway accounts could join a stranger's shared pet.
--
-- Now: `create_pet_invite` makes an 8-character code from cryptographically
-- random bytes (32^8, about 10^12) and fixes the 7-day expiry; the client can
-- no longer insert invites itself. Redeeming is limited to 10 tries an hour
-- per account, and every dead code -- unknown, used, expired, revoked -- gets
-- the same answer.

-- Old 6-character codes still redeem until they expire.
alter table public.pet_invites drop constraint if exists pet_invites_code_check;
alter table public.pet_invites add constraint pet_invites_code_check check (code ~ '^[A-Z2-9]{6,10}$');
-- New invites only; a week and a little slack.
alter table public.pet_invites drop constraint if exists pet_invites_expiry_bound;
alter table public.pet_invites
  add constraint pet_invites_expiry_bound check (expires_at <= created_at + interval '8 days') not valid;

drop policy if exists "Owners create invites" on public.pet_invites;

create or replace function public.create_pet_invite(p_pet_id uuid)
returns public.pet_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  -- Same alphabet as INVITE_CODE_ALPHABET in packages/core (no 0/O/1/I).
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  attempt_byte integer;
  new_code text;
  created public.pet_invites;
begin
  if caller is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;
  if not exists (
    select 1 from public.pet_members
    where pet_id = p_pet_id and user_id = caller and role = 'owner' and left_at is null
  ) then
    raise exception using message = 'NOT_YOUR_PET', errcode = '42501';
  end if;

  -- One live code per pet: making a new one retires the old.
  update public.pet_invites
  set revoked_at = now()
  where pet_id = p_pet_id and redeemed_at is null and revoked_at is null;

  for attempt in 1..5 loop
    -- gen_random_uuid() is cryptographically random. Bytes 6 and 8 carry the
    -- version and variant bits, so the code is drawn from bytes that do not.
    -- 256 is a multiple of 32, so `% 32` is unbiased.
    random_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    new_code := '';
    foreach attempt_byte in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
      new_code := new_code || substr(alphabet, (get_byte(random_bytes, attempt_byte) % 32) + 1, 1);
    end loop;
    begin
      insert into public.pet_invites (pet_id, created_by, code, expires_at)
      values (p_pet_id, caller, new_code, now() + interval '7 days')
      returning * into created;
      return created;
    exception when unique_violation then
      null; -- A collision in 10^12: try again.
    end;
  end loop;
  raise exception using message = 'INVITE_FAILED';
end;
$$;
revoke all on function public.create_pet_invite(uuid) from public, anon;
grant execute on function public.create_pet_invite(uuid) to authenticated;

-- Redeem attempts, for the rate limit. Server-only.
create table if not exists public.invite_redeem_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists invite_redeem_attempts_user_time on public.invite_redeem_attempts (user_id, attempted_at);
alter table public.invite_redeem_attempts enable row level security;

-- Returns the joined pet's id, or NULL for any code that does not open a pet.
-- NULL rather than an error on purpose: raising would roll back the attempt
-- row below, so a guesser would never be counted.
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

  if (
    select count(*) from public.invite_redeem_attempts
    where user_id = caller and attempted_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception using message = 'INVITE_RATE_LIMITED';
  end if;

  -- Depends only on the caller, so it is answered before any code is looked
  -- at: it must not be a free way to test whether a code is real.
  if exists (
    select 1 from public.pet_members
    where user_id = caller and role = 'partner' and left_at is null
  ) then
    raise exception using message = 'HAS_JOINT_PET';
  end if;

  insert into public.invite_redeem_attempts (user_id) values (caller);
  -- Housekeeping, now and then.
  if random() < 0.01 then
    delete from public.invite_redeem_attempts where attempted_at < now() - interval '1 day';
  end if;

  select * into invite
  from public.pet_invites
  where code = normalized
  for update;
  -- Unknown, used, revoked and expired codes all look the same.
  if not found or invite.redeemed_at is not null or invite.revoked_at is not null or invite.expires_at < now() then
    return null;
  end if;

  -- Serialise redemptions per pet so two codes for the same pet cannot both
  -- pass the member-count check at once.
  perform 1 from public.pets where id = invite.pet_id for update;

  if not exists (
    select 1 from public.pet_members
    where pet_id = invite.pet_id and user_id = invite.created_by and role = 'owner' and left_at is null
  ) then
    return null;
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

-- ---------------------------------------------------------------------------
-- 2. Leaving a shared pet means leaving it.
-- ---------------------------------------------------------------------------
-- `pets.user_id` stays on the creator after they leave, and three places
-- still trusted it: reading the pet, switching its breed (spending the
-- partner's coins), and its personality-change count. Only someone who has
-- not left keeps those rights. And while a partner is still caring for a pet,
-- the creator cannot delete it out from under them (which would also wipe the
-- partner's private chats with it).

create or replace function public.has_left_pet(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pet_members
    where pet_id = p_pet_id and user_id = auth.uid() and left_at is not null
  );
$$;
revoke all on function public.has_left_pet(uuid) from public, anon;
grant execute on function public.has_left_pet(uuid) to authenticated;

-- The creator branch stays for the moment of adoption (see 20260908130000),
-- but no longer outlives leaving.
drop policy if exists "Members read their pet" on public.pets;
create policy "Members read their pet" on public.pets
  for select using (
    public.is_active_pet_member(id)
    or (auth.uid() = user_id and not public.has_left_pet(id))
  );

drop policy if exists "Creators delete their pet" on public.pets;
create policy "Creators delete their pet" on public.pets
  for delete using (
    auth.uid() = user_id
    and public.is_active_pet_member(id)
    and not exists (
      select 1 from public.pet_members m
      where m.pet_id = pets.id and m.user_id <> auth.uid() and m.left_at is null
    )
  );

create or replace function public.switch_pet_breed(p_pet_id uuid, p_breed text)
returns table(breed text, coins integer, version integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cost constant integer := 500;
  free boolean := coalesce(auth.jwt() ->> 'email', '') = 'kyleyli2005@gmail.com';
  current_row public.pets;
begin
  select * into current_row from public.pets where id = p_pet_id for update;
  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Active carers only: a creator who has left no longer spends this pet's coins.
  if not public.is_active_pet_member(p_pet_id) then
    raise exception 'NOT_YOUR_PET' using errcode = '42501';
  end if;
  if current_row.breed is not distinct from p_breed then
    return query select current_row.breed, current_row.coins, current_row.version;
    return;
  end if;
  if not free and current_row.coins < cost then
    raise exception 'NOT_ENOUGH_COINS' using errcode = 'P0001', detail = current_row.coins::text;
  end if;

  perform set_config('vitto.coins_write', 'on', true);
  return query
    update public.pets p
    set breed = p_breed,
        coins = p.coins - case when free then 0 else cost end
    where p.id = p_pet_id
    returning p.breed, p.coins, p.version;
end;
$$;
revoke all on function public.switch_pet_breed(uuid, text) from public, anon;
grant execute on function public.switch_pet_breed(uuid, text) to authenticated;

create or replace function public.personality_changes_left(p_pet_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, public.personality_change_limit() - public.personality_changes_this_month(p_pet_id))
  where public.is_active_pet_member(p_pet_id)
     or exists (
       select 1 from public.pets p
       where p.id = p_pet_id and p.user_id = auth.uid() and not public.has_left_pet(p_pet_id)
     );
$$;

-- ---------------------------------------------------------------------------
-- 3. The waitlist no longer says whether an email is on it.
-- ---------------------------------------------------------------------------
-- A duplicate was silently dropped (201, nothing returned) while a new email
-- inserted a row whose RETURNING then failed RLS (an error) -- so the response
-- told anyone whether an address was listed. Now every insert is swallowed:
-- the trigger stores the email itself and the caller's own insert never
-- happens, so new and existing addresses look identical. The landing page
-- keeps posting exactly as it does. The client no longer picks id/created_at.
create or replace function public.swallow_waitlist_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The trigger's own insert, below: let it through.
  if current_setting('vitto.waitlist_write', true) = 'on' then
    return new;
  end if;
  perform set_config('vitto.waitlist_write', 'on', true);
  insert into public.waitlist (email, source)
  values (new.email, left(coalesce(new.source, 'web'), 40))
  on conflict (email_normalized) do nothing;
  perform set_config('vitto.waitlist_write', '', true);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A separate AI budget for free accounts.
-- ---------------------------------------------------------------------------
-- Free sign-ups are free, so a few hundred scripted accounts could spend the
-- whole app's daily AI ceiling and lock out paying users. Free calls now also
-- count against their own, smaller, ceiling. The 4-argument version stays so
-- already-deployed functions keep working until they are redeployed.
alter table public.ai_calls add column if not exists tier text not null default 'free';
create index if not exists ai_calls_tier_time on public.ai_calls (tier, created_at);

create or replace function public.claim_ai_call(
  p_user uuid,
  p_kind text,
  p_user_limit integer,
  p_global_limit integer,
  p_tier text,
  p_free_global_limit integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - interval '24 hours';
  used integer;
  everyone integer;
  free_everyone integer;
  call_tier text := case when p_tier = 'plus' then 'plus' else 'free' end;
begin
  perform pg_advisory_xact_lock(hashtext('ai_call:' || p_user::text || ':' || p_kind));

  select count(*) into used
  from ai_calls
  where user_id = p_user and kind = p_kind and created_at >= since;
  if used >= p_user_limit then
    return 'user_limit';
  end if;

  select count(*) into everyone from ai_calls where created_at >= since;
  if everyone >= p_global_limit then
    return 'global_limit';
  end if;

  if call_tier = 'free' then
    select count(*) into free_everyone from ai_calls a where a.tier = 'free' and a.created_at >= since;
    if free_everyone >= p_free_global_limit then
      return 'global_limit';
    end if;
  end if;

  insert into ai_calls (user_id, kind, tier) values (p_user, p_kind, call_tier);

  if random() < 0.01 then
    delete from ai_calls where created_at < now() - interval '2 days';
  end if;

  return 'ok';
end;
$$;

revoke all on function public.claim_ai_call(uuid, text, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_call(uuid, text, integer, integer, text, integer) to service_role;
