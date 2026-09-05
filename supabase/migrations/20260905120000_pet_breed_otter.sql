-- Widens the breed CHECK to cover every breed the app can adopt.
--
-- `otter` was added as a selectable pet without a matching migration, so the
-- constraint still only allowed the previous three. That does not fail at adoption
-- alone: `savePet` writes the whole row, so once a pet was an otter EVERY later
-- save failed too -- logging a meal, a workout, a step sync -- with a raw
-- "violates check constraint" error surfaced straight to the user.
--
-- A CHECK violation is also not something the repository can absorb: it is not a
-- missing-column error, so `saveDroppingMissingColumns` rethrows it rather than
-- retrying without the column.
--
-- The list must stay in step with PET_BREEDS in packages/core/src/domain/pet.ts.
-- `pet.test.ts` reads this file and fails if the two drift apart, so adding a
-- breed without a migration is caught before it reaches a device.
--
-- Found by inspecting pg_constraint rather than assuming the generated name, so
-- this is safe to re-run.
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'pets'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%breed%'
  limit 1;

  if existing_constraint is not null then
    execute format('alter table public.pets drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.pets
  add constraint pets_breed_check check (breed in ('bichon', 'shiba', 'orangeCat', 'otter'));
