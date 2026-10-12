-- Fix for 20261012140000: a new account must never fail because of its name.
--
-- `handle_new_user` seeds `profiles.display_name` from the sign-up email when
-- the app sends no name (it does not: the name comes later, in onboarding).
-- The insert check added in 20261012140000 raised on a name over 60
-- characters, so an email that long could not sign up at all. On insert the
-- name is now cut to 60 instead; the check on a changed name still refuses.

create or replace function public.limit_display_name_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is not null and char_length(new.display_name) > 60 then
    new.display_name := left(new.display_name, 60);
  end if;
  return new;
end;
$$;
