-- "Your own" temperament: the person describes the character themselves.
--
-- `personality = 'custom'` marks it and `persona` holds the description, which
-- reaches the companion prompt as the pet's voice — quoted as data, under the
-- rules, which it cannot loosen (see `customVoice` in
-- packages/core/src/companion/prompts.ts). Bounded here as well as in the app,
-- because it is free text from a person and goes into a prompt.
alter table public.pets
  add column if not exists persona text
    check (persona is null or char_length(persona) between 1 and 300);

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
    'feisty', 'cute', 'sweet', 'savage', 'hype', 'menace', 'custom',
    -- retired, still worn by pets adopted before them
    'energetic', 'chill', 'competitive', 'supportive'
  ));
