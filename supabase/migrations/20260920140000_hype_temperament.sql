-- A fifth temperament: `hype`, the smooth-talking hype man.
--
-- A new migration rather than an edit to 20260920130000, which is already
-- applied: an edited file never runs again, and the constraint it left in place
-- would reject every pet adopted with the new value.
--
-- Same approach as there: the old rule is found by what it checks, so this works
-- whatever the constraint ended up being called.
do $$
declare
  victim text;
begin
  for victim in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'pets' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%personality%'
  loop
    execute format('alter table public.pets drop constraint %I', victim);
  end loop;
end $$;

alter table public.pets
  add constraint pets_personality_check check (personality is null or personality in (
    -- offered at adoption
    'feisty', 'cute', 'sweet', 'savage', 'hype',
    -- retired, still worn by pets adopted before them
    'energetic', 'chill', 'competitive', 'supportive'
  ));
