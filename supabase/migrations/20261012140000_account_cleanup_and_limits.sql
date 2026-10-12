-- More fixes from the security review.
--
-- 1. Deleting an account now also removes its waitlist entry, which is keyed
--    by email and so never cascaded. (Old meal photos in the `meal-images`
--    bucket are cleared by hand once: nothing has been stored there since
--    20261002120000, and storage objects cannot be deleted from SQL.)
-- 2. Limits on what a client can write, so no one can bloat the database:
--    display names, a logged event's details, and the pet's recent meals.
-- 3. `get_friend_recent_activity` is closed to signed-out callers outright, the
--    same as every other friend function (it already returned nothing to them).

-- 1. Account deletion --------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  shared_pet record;
  survivor uuid;
begin
  if caller is null then
    raise exception using message = 'NOT_SIGNED_IN';
  end if;

  -- Hand over any shared pet this user created, so the other carer keeps it.
  for shared_pet in
    select p.id from public.pets p where p.user_id = caller
  loop
    select m.user_id into survivor
    from public.pet_members m
    where m.pet_id = shared_pet.id
      and m.user_id <> caller
      and m.left_at is null
    order by m.joined_at asc, m.user_id asc
    limit 1;

    if survivor is not null then
      perform set_config('vitto.transfer_pet', 'on', true);
      update public.pets set user_id = survivor where id = shared_pet.id;
      perform set_config('vitto.transfer_pet', '', true);
    end if;
  end loop;

  -- The waitlist is keyed by email, not by user, so it does not cascade.
  delete from public.waitlist w
  using auth.users u
  where u.id = caller and u.email is not null and w.email_normalized = lower(btrim(u.email));

  -- Everything else goes with the user row.
  delete from auth.users where id = caller;
end;
$$;

-- 2. Size limits -------------------------------------------------------------

-- Display names: checked only when the name changes. Some early accounts hold
-- their sign-up email here, which can run longer; a plain CHECK would fail
-- every later update to those rows, even ones that never touch the name.
create or replace function public.limit_display_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name
     and new.display_name is not null
     and char_length(new.display_name) > 60 then
    raise exception 'That name is too long.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_display_name_length on public.profiles;
create trigger profiles_display_name_length
  before update of display_name on public.profiles
  for each row execute function public.limit_display_name();

drop trigger if exists profiles_display_name_length_insert on public.profiles;
create or replace function public.limit_display_name_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is not null and char_length(new.display_name) > 60 then
    raise exception 'That name is too long.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger profiles_display_name_length_insert
  before insert on public.profiles
  for each row execute function public.limit_display_name_insert();

-- A logged moment's details. The biggest real one, a long workout with every
-- set, is a few kilobytes; 64 kB is room to spare and no room to abuse.
-- NOT VALID: rows already there are not rechecked, new and changed ones are.
alter table public.health_events drop constraint if exists health_events_metadata_size;
alter table public.health_events
  add constraint health_events_metadata_size check (pg_column_size(metadata) <= 65536) not valid;

-- The pet's recent meals: at most 60 small entries (pets_recent_meals_valid),
-- now also bounded in size, so each entry cannot carry a payload.
alter table public.pets drop constraint if exists pets_recent_meals_size;
alter table public.pets
  add constraint pets_recent_meals_size check (recent_meals is null or pg_column_size(recent_meals) <= 16384) not valid;

-- 3. Signed-out callers ------------------------------------------------------

revoke all on function public.get_friend_recent_activity(uuid) from anon;
