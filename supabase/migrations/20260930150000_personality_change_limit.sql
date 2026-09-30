-- At most 30 personality changes per pet per calendar month (UTC).
--
-- A change of temperament, dials or persona is a change of voice, and a new
-- voice costs a model call: the pet's bank of push lines is rewritten in it
-- (see packages/core/src/companion/pushLines.ts). Unlimited flipping would be
-- an unbounded bill. Base, sliders and notes are saved together, so one save of
-- the character is one change.
--
-- Enforced here rather than in the app, because the app writes `pets` directly.
-- At the limit the trigger KEEPS THE OLD CHARACTER instead of raising: a care
-- save that happens to carry a stale character must still save its care. The
-- app checks `personality_changes_left` first and stops the save itself, so a
-- person never meets the silent version.

create table if not exists public.pet_personality_changes (
  id bigint generated always as identity primary key,
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists pet_personality_changes_pet_month
  on public.pet_personality_changes (pet_id, changed_at);

-- No policies: only the functions below (security definer) read or write it.
alter table public.pet_personality_changes enable row level security;

create or replace function public.personality_change_limit()
returns integer
language sql
immutable
as $$ select 30 $$;

create or replace function public.personality_changes_this_month(p_pet_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.pet_personality_changes
  where pet_id = p_pet_id
    and changed_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

revoke all on function public.personality_changes_this_month(uuid) from public, anon, authenticated;

-- What the app shows. Only for someone who cares for the pet; null otherwise.
create or replace function public.personality_changes_left(p_pet_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, public.personality_change_limit() - public.personality_changes_this_month(p_pet_id))
  where exists (select 1 from public.pets p where p.id = p_pet_id and p.user_id = auth.uid())
     or public.is_active_pet_member(p_pet_id);
$$;

revoke all on function public.personality_changes_left(uuid) from public, anon;
grant execute on function public.personality_changes_left(uuid) to authenticated;

create or replace function public.limit_personality_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.personality is not distinct from old.personality
     and new.persona is not distinct from old.persona
     and new.personality_dials is not distinct from old.personality_dials then
    return new;
  end if;

  -- The service role (admin tooling, backfills) is not a person changing a voice.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- The dev account is uncapped here as it is everywhere else (DEV_EMAILS in
  -- the companion function); its changes are still logged.
  if coalesce(auth.jwt() ->> 'email', '') <> 'kyleyli2005@gmail.com'
     and public.personality_changes_this_month(new.id) >= public.personality_change_limit() then
    new.personality := old.personality;
    new.persona := old.persona;
    new.personality_dials := old.personality_dials;
    return new;
  end if;

  insert into public.pet_personality_changes (pet_id, user_id) values (new.id, auth.uid());
  return new;
end;
$$;

drop trigger if exists limit_personality_changes on public.pets;
create trigger limit_personality_changes
  before update on public.pets
  for each row execute function public.limit_personality_changes();
