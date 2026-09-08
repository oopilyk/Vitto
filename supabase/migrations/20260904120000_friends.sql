-- Friends & Social Pets: username-based friend requests, read-only pet/profile
-- sharing between accepted friends, and a minimal username search RPC.
--
-- Scope: add friends by username, view a friend's pet read-only. No chat,
-- likes, notifications, leaderboards, feeds, or pet-discovery/editing.
--
-- Mirrors packages/core/src/domain/friends.ts (FriendRequest,
-- FriendProfileSummary, FriendRequestStatus, USERNAME_PATTERN). Keep in sync.

-- a. profiles.username -------------------------------------------------------

alter table public.profiles add column if not exists username text
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index if not exists profiles_username_unique on public.profiles (username);

-- b. friend_requests table ---------------------------------------------------

create table if not exists public.friend_requests (
  id uuid primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- A declined request is just history; a partial unique index (rather than a
-- plain one) means only pending/accepted rows block a duplicate/reciprocal
-- insert, so a fresh request after a decline is a brand new row and succeeds.
create unique index if not exists friend_requests_active_pair
  on public.friend_requests (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending', 'accepted');

create index if not exists friend_requests_requester_idx on public.friend_requests(requester_id);
create index if not exists friend_requests_addressee_idx on public.friend_requests(addressee_id);

-- c. RLS ----------------------------------------------------------------------

alter table public.friend_requests enable row level security;

drop policy if exists "View own friend requests" on public.friend_requests;
create policy "View own friend requests" on public.friend_requests
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- `status = 'pending'` is pinned here (not just defaulted) so a caller cannot
-- self-service-insert an already-'accepted' row and skip the addressee's
-- consent step entirely.
drop policy if exists "Users send friend requests as themselves" on public.friend_requests;
create policy "Users send friend requests as themselves" on public.friend_requests
  for insert with check (auth.uid() = requester_id and requester_id <> addressee_id and status = 'pending');

drop policy if exists "Addressee responds to a pending request" on public.friend_requests;
create policy "Addressee responds to a pending request" on public.friend_requests
  for update using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status in ('accepted','declined'));

drop policy if exists "Either party removes a friend request" on public.friend_requests;
create policy "Either party removes a friend request" on public.friend_requests
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- The UPDATE policy above only re-checks addressee_id/status on the new row --
-- nothing stops the same UPDATE from also rewriting requester_id to name an
-- arbitrary third party, forging an "accepted" relationship that party never
-- agreed to. A trigger enforces identity columns are immutable after insert,
-- independent of (and defensively redundant with) any future policy change.
create or replace function public.lock_friend_request_identity()
returns trigger
language plpgsql
as $$
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'requester_id and addressee_id cannot be changed on an existing friend_requests row';
  end if;
  return new;
end;
$$;

drop trigger if exists friend_requests_lock_identity on public.friend_requests;
create trigger friend_requests_lock_identity
  before update on public.friend_requests
  for each row execute procedure public.lock_friend_request_identity();

-- pets: keep the existing owner-only ALL policy untouched. Add a second,
-- additive SELECT-only policy so an accepted friend can view (never edit) a
-- pet.
drop policy if exists "Friends view accepted friend pets" on public.pets;
create policy "Friends view accepted friend pets" on public.pets
  for select using (
    exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = auth.uid() and fr.addressee_id = pets.user_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = pets.user_id))
    )
  );

-- profiles: keep the existing owner-only ALL policy untouched, and add NO
-- table-level SELECT policy for friends. RLS gates rows, not columns -- a
-- friend-scoped `for select` policy on `profiles` would let any accepted
-- friend `select *` and read every column, including age/sex/height_cm/
-- weight_kg/activity/goal, which must stay owner-only even between friends.
-- A friend's display name/username is exposed only through the column-limited
-- RPC below, the same pattern as search_profiles.

-- d. Username search RPC ------------------------------------------------------

-- SECURITY DEFINER and a fixed, minimal projection so a non-friend can never
-- enumerate/browse arbitrary profiles via a table-level policy -- this is the
-- only path to discovering another user by username.
create or replace function public.search_profiles(search_query text)
returns table(id uuid, username text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name
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

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

-- e. Friend-facing profile lookup RPC ----------------------------------------

-- Column-limited counterpart to search_profiles, used once two users are
-- already friends (e.g. to show a display name next to their pet). Deliberately
-- NOT a table-level SELECT policy on `profiles` -- see the comment above the
-- (intentionally absent) friends policy on that table.
create or replace function public.get_friend_profile(friend_id uuid)
returns table(id uuid, username text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where p.id = friend_id
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = auth.uid() and fr.addressee_id = friend_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = friend_id))
    );
$$;

revoke all on function public.get_friend_profile(uuid) from public;
grant execute on function public.get_friend_profile(uuid) to authenticated;
