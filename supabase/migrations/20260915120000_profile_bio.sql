-- A short "about" line on a profile, and showing it to friends.
--
-- The app already had the two halves of an identity -- `username` (unique,
-- claimed at signup) and `display_name` (what a care partner sees) -- but
-- nowhere to say anything about yourself. This adds that, and surfaces it
-- wherever a friend's identity is already surfaced.
--
-- PRIVACY. `bio` is free text the user writes about themselves, so it is
-- deliberately NOT added to anything with a wider audience than the two columns
-- it sits beside. `get_friend_profile` already gates on an accepted-or-pending
-- friendship and returns exactly one row of exactly the columns named; adding
-- `bio` there widens that projection by one field and its audience by nobody.
-- `search_profiles` is left alone on purpose: it answers a username lookup for
-- strangers, and a bio has no business in a stranger-facing search result.

alter table public.profiles
  add column if not exists bio text check (bio is null or char_length(bio) <= 280);

comment on column public.profiles.bio is
  'Short self-description, at most 280 characters. Visible to accepted and pending friends via get_friend_profile.';

-- The return type gains a column, which `create or replace` cannot do -- a
-- function''s result type is fixed once created -- so it is dropped first. Safe:
-- it is re-created immediately below, in the same transaction as the rest of
-- this migration.
drop function if exists public.get_friend_profile(uuid);

create function public.get_friend_profile(friend_id uuid)
returns table(id uuid, username text, display_name text, bio text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.bio
  from public.profiles p
  where p.id = friend_id
    and exists (
      select 1 from public.friend_requests fr
      where fr.status in ('accepted', 'pending')
        and ((fr.requester_id = auth.uid() and fr.addressee_id = friend_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = friend_id))
    );
$$;
