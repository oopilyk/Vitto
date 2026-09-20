-- Four temperaments with real distance between them.
--
-- The original set (energetic, chill, competitive, supportive) all landed as
-- mild variations of "friendly": with the AI companion reading the temperament,
-- the difference between them was not audible. The new set is offered at
-- adoption instead, and reaches the model as explicit guidance on how that pet
-- talks (see `PERSONALITY_VOICE` in packages/core/src/companion/prompts.ts).
--
-- The old four stay VALID rather than being migrated away. Pets already wear
-- them, `petVoice` and the companion's trait seeding both still handle them, and
-- rewriting somebody's pet into a character they did not choose is worse than
-- carrying four extra enum values. They are simply no longer offered.
--
-- `savage` swears mildly and roasts the person it lives with. Its limits are
-- enforced in the prompt, not here: never their body, their weight, what they
-- ate, or a missed workout. Worth knowing for app-store age rating — the profile
-- allows ages from 13, and a pet that swears is the kind of thing a rating
-- questionnaire asks about directly.

-- Found by what it checks, not by its name: the original was declared inline
-- with the column, so its name is whatever Postgres generated. Dropping the
-- wrong name would silently leave the old rule in place and reject every new
-- temperament.
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
    'feisty', 'cute', 'sweet', 'savage',
    -- retired, still worn by pets adopted before them
    'energetic', 'chill', 'competitive', 'supportive'
  ));
