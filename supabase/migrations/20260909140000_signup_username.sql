-- Usernames are chosen at registration.
--
-- `profiles.username` and its unique index already existed (see 20260904120000),
-- but nothing set them until a user opened the Friends screen and filled the
-- field in there. Registration now asks for one, which needs two things the
-- database did not previously offer.
--
-- 1. The signup trigger has to carry it. A new account is created by GoTrue, and
--    the profile row is written by `handle_new_user` from the signup metadata --
--    the client cannot insert it itself, because with email confirmation on
--    there is no session yet and RLS would reject the write.
--
-- 2. The registration form has to be able to check availability BEFORE
--    submitting, and at that point the caller is anonymous. `profiles` has no
--    anon SELECT policy (deliberately -- see the friends migration), so this
--    needs a SECURITY DEFINER function with a deliberately narrow answer: one
--    boolean, never a row, so it cannot be used to read anything else.

-- a. Availability check ------------------------------------------------------

-- Returns false for a malformed candidate as well as a taken one, so the form
-- has a single "can I use this" answer. Case is folded to match how usernames
-- are stored (always lower case -- the CHECK constraint enforces it).
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    candidate is not null
    and lower(trim(candidate)) ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles p where p.username = lower(trim(candidate))
    );
$$;

revoke all on function public.username_available(text) from public;
-- anon as well as authenticated: the whole point is to answer during signup,
-- before the account exists. It reveals only whether a username is taken, which
-- is the same thing the signup itself would reveal.
grant execute on function public.username_available(text) to anon, authenticated;

-- b. Carry the username through signup ---------------------------------------

-- Extends the existing trigger; every other column it writes is unchanged.
--
-- A malformed username is stored as NULL rather than raised, so a bad value can
-- never block account creation -- the client validates the format, and the
-- friends screen can still set one later. A username that is TAKEN is different:
-- the unique index raises, the signup fails, and the person picks another. That
-- is deliberate. Silently dropping it would hand someone an account they believe
-- has a username it does not have.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  candidate text := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
begin
  if candidate !~ '^[a-z0-9_]{3,20}$' then
    candidate := null;
  end if;

  insert into public.profiles (id, display_name, username, age, sex, height_cm, weight_kg, activity, goal)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email),
    candidate,
    (new.raw_user_meta_data->>'age')::integer,
    new.raw_user_meta_data->>'sex',
    (new.raw_user_meta_data->>'heightCm')::numeric,
    (new.raw_user_meta_data->>'weightKg')::numeric,
    new.raw_user_meta_data->>'activity',
    new.raw_user_meta_data->>'goal');
  return new;
end;
$$;
