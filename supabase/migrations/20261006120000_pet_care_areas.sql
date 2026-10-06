-- What affects a pet: the care areas its owner chose (food, training, movement,
-- mind; see packages/core/src/domain/careAreas.ts). A need none of them feeds
-- is held steady instead of decaying, so someone who doesn't track food can
-- raise a pet that never gets hungry.
--
-- On the pet, not the profile: a shared pet has one set of rules, the owner's,
-- and both carers see it the same way. NULL means every area, which is how
-- every pet has always behaved.

alter table public.pets add column if not exists care_areas text[];

alter table public.pets drop constraint if exists pets_care_areas_valid;
alter table public.pets add constraint pets_care_areas_valid check (
  care_areas is null
  or (
    cardinality(care_areas) between 1 and 4
    and care_areas <@ array['nutrition', 'training', 'movement', 'mind']::text[]
  )
);

-- Carry over choices already made: the profile's focus areas held this before
-- (and did nothing with it). Only where someone actually narrowed them.
update public.pets p
set care_areas = pr.focus_areas
from public.profiles pr
where pr.id = p.user_id
  and p.care_areas is null
  and pr.focus_areas is not null
  and cardinality(pr.focus_areas) between 1 and 3
  and pr.focus_areas <@ array['nutrition', 'training', 'movement', 'mind']::text[];

-- Only the owner decides. A partner's client writes the whole pet row on every
-- care moment, carrying whatever care areas it last read; refusing those saves
-- would lose real care over a stale copy of a setting it never meant to touch.
-- So a change from anyone else is quietly undone, and the save goes through.
create or replace function public.guard_pet_care_areas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.care_areas is distinct from old.care_areas
     and auth.uid() is not null
     and not exists (
       select 1 from public.pet_members m
       where m.pet_id = old.id and m.user_id = auth.uid() and m.role = 'owner' and m.left_at is null
     )
  then
    new.care_areas := old.care_areas;
  end if;
  return new;
end;
$$;

drop trigger if exists pets_guard_care_areas on public.pets;
create trigger pets_guard_care_areas
  before update on public.pets
  for each row execute function public.guard_pet_care_areas();
