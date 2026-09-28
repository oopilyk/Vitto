-- Security fixes to the social read surface, and to the waitlist.
--
-- Each of these is a later migration having widened a projection past the
-- privacy line an earlier one drew. Nothing here changes a table's shape; it is
-- five narrowings and one restored grant.
--
--   1. `search_profiles` returned the sign-up email to any signed-in user.
--   2. `get_friend_profile` handed a stranger's bio to anyone who sent an
--      unaccepted friend request.
--   3. `get_friend_profile` lost its `revoke`/`grant` and defaulted to PUBLIC.
--   4. The friends-view policy on `pets` keyed on the historical adopter, so a
--      departed creator's friends kept reading a pet they no longer care for.
--   5. Inserting into `waitlist` answered "is this address already signed up?"

-- ---------------------------------------------------------------------------
-- 1. `search_profiles` must not return the sign-up email.
-- ---------------------------------------------------------------------------
-- `handle_new_user` seeds `display_name` from `new.email` when the client sends
-- no name (20260909140000_signup_username.sql), so for most accounts that
-- column IS the email address. `get_pet_members` has always scrubbed it; this
-- is the same scrub, which is what the search should have had all along.
--
-- An email-shaped name comes back NULL rather than as the local part: callers
-- already handle a null display name (the members list has returned one since
-- 20260907120000), and half an address is still half an address.
create or replace function public.search_profiles(search_query text)
returns table(id uuid, username text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    case
      when p.display_name is null or btrim(p.display_name) = '' or p.display_name like '%@%' then null
      else p.display_name
    end
  from public.profiles p
  where p.username is not null
    -- Escape LIKE wildcards in the caller-supplied query so '%'/'_' search for
    -- themselves literally rather than broadening the match.
    and p.username ilike replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
    and p.id <> auth.uid()
    and length(search_query) >= 2
  order by p.username
  limit 20;
$$;

revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 + 3. `get_friend_profile`: bio only once the friendship is mutual, and the
--        execute grant put back.
-- ---------------------------------------------------------------------------
-- The 'pending' branch (20260910130000) was justified on the grounds that a
-- pending request leaked nothing `search_profiles` did not already give away.
-- True of username and display name; not true of `bio`, which was added to this
-- same projection five migrations later by 20260915120000, whose own header
-- says "a bio has no business in a stranger-facing search result".
--
-- A pending request is created UNILATERALLY -- the insert policy asks only that
-- you are the requester -- so the whole chain was: find them in search, send a
-- request they never see, read their bio. Declining did not help either: a
-- fresh request after a decline is a new row (documented in 20260904120000), so
-- it could be repeated indefinitely.
--
-- Identity still resolves while pending, because the friends screen needs a name
-- to show next to an incoming request. Only `bio` waits for 'accepted'.
--
-- The grant block below is the point of 3: 20260915120000 did DROP + CREATE
-- with no grants, and a DROP resets the ACL to Postgres's default of EXECUTE TO
-- PUBLIC. It failed closed only because the gate reads `auth.uid()`, which is
-- NULL for anon -- an accident, not a control.
create or replace function public.get_friend_profile(friend_id uuid)
returns table(id uuid, username text, display_name text, bio text)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    case
      when p.display_name is null or btrim(p.display_name) = '' or p.display_name like '%@%' then null
      else p.display_name
    end,
    case when fr.status = 'accepted' then p.bio end
  from public.profiles p
  join lateral (
    select fr.status
    from public.friend_requests fr
    where fr.status in ('accepted', 'pending')
      and ((fr.requester_id = auth.uid() and fr.addressee_id = friend_id)
        or (fr.addressee_id = auth.uid() and fr.requester_id = friend_id))
    -- Accepted wins if both an accepted and a stale pending row exist.
    order by (fr.status = 'accepted') desc
    limit 1
  ) fr on true
  where p.id = friend_id;
$$;

revoke all on function public.get_friend_profile(uuid) from public, anon;
grant execute on function public.get_friend_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Friends see a pet only while the person they are friends with still cares
--    for it.
-- ---------------------------------------------------------------------------
-- `pets.user_id` means "who adopted it", not "who looks after it"
-- (20260907120000). An owner who leaves a shared pet does not hand `user_id`
-- over -- 20260909150000 is explicit that "the pet simply stays in their joint
-- slot, ownerless" -- so every friend of the departed creator kept full read
-- access to a pet now cared for by someone they have no relationship with.
--
-- Narrowed rather than re-keyed: this still asks that the ADOPTER be your
-- friend, and adds that the adopter must still be an active member. Keying on
-- "any active member is your friend" would instead WIDEN this to the other
-- carer's friends, which is a product decision, not a security fix.
--
-- Safe against old rows: 20260907120000 backfilled a membership for every pet
-- that existed, and `on_pet_created` has created one for every pet since.
drop policy if exists "Friends view accepted friend pets" on public.pets;
create policy "Friends view accepted friend pets" on public.pets
  for select to authenticated
  using (
    exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = auth.uid() and fr.addressee_id = pets.user_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = pets.user_id))
    )
    and exists (
      select 1
      from public.pet_members m
      where m.pet_id = pets.id
        and m.user_id = pets.user_id
        and m.left_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 5. The waitlist must not answer "is this person signed up?"
-- ---------------------------------------------------------------------------
-- The table is insert-only with no select policy, so the list cannot be read --
-- but the unique index on `email_normalized` made every insert an oracle: a
-- 23505 conflict for an address already present, a 201 for one that was not.
-- Anyone with the publishable key (it ships in the landing page's JavaScript)
-- could test addresses one at a time.
--
-- A trigger rather than a client-side `on conflict`: the page lives in another
-- repository now, and a privacy property should not depend on a caller
-- remembering a header. Returning NULL from a BEFORE INSERT trigger skips the
-- row, so a duplicate is silently accepted and both cases look identical.
create or replace function public.swallow_waitlist_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.waitlist w
    where w.email_normalized = lower(btrim(new.email))
  ) then
    return null; -- already on the list; indistinguishable from a fresh sign-up
  end if;
  return new;
end;
$$;

drop trigger if exists waitlist_swallow_duplicate on public.waitlist;
create trigger waitlist_swallow_duplicate
  before insert on public.waitlist
  for each row execute function public.swallow_waitlist_duplicate();

-- ---------------------------------------------------------------------------
-- 6. Bound what can be put in the meal-images bucket.
-- ---------------------------------------------------------------------------
-- The bucket was created with no size or type limit (20260829130000), so an
-- authenticated caller could upload a file of any size and any type. The app
-- compresses to `quality: 0.6` before uploading, but that is the client's
-- choice and an attacker does not use the client. It also fed a memory DoS:
-- `analyze-meal` base64-encodes whatever it downloads.
--
-- 8 MB is generous for a photo of a plate; the app's own uploads are well under.
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'meal-images';
