-- `breed` was added by 20260901140000_pet_breed.sql with an inline
-- `check (breed in ('bichon', 'shiba'))`. A new sprite sheet means a new breed
-- value, and without widening that constraint the pet save fails outright --
-- a CHECK violation is not a "missing column" error, so the repository's
-- drop-the-column-and-retry path cannot absorb it.
--
-- The original constraint was created inline and so carries a generated name.
-- Rather than assume it, find whichever check constraint on `pets` mentions
-- `breed` and drop that, which also makes this safe to re-run.
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
  add constraint pets_breed_check check (breed in ('bichon', 'shiba', 'orangeCat'));
