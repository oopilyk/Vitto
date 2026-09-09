-- Adds the seven new companions, and retires `orangeCat`.
--
-- The retirement is why this migration does more than widen the CHECK. Rows
-- already holding 'orangeCat' would violate the new constraint the moment it is
-- added, so the constraint cannot simply be replaced: every such pet is moved
-- onto 'tabbyCat', the cat drawn to replace it, BEFORE the new CHECK goes on.
-- Without that step this migration fails outright on any database where someone
-- had adopted the orange cat, and on a device it would surface the same way the
-- missing otter migration did -- a raw "violates check constraint" banner on the
-- next meal logged.
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

-- Re-home the retired breed while nothing is constraining the column.
update public.pets set breed = 'tabbyCat' where breed = 'orangeCat';

alter table public.pets
  add constraint pets_breed_check check (
    breed in (
      'bichon', 'shiba', 'otter', 'tabbyCat',
      'bunny', 'fox', 'koala', 'bear', 'axolotl', 'dino'
    )
  );
