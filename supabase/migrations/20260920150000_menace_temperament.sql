-- `menace`: the bossy, foul-mouthed temperament.
--
-- Offered only to adults (see `petPersonalityOptionsFor` in
-- packages/core/src/domain/onboarding.ts). The check below still accepts it for
-- any pet: offering is the gate, and a pet already wearing it must keep saving.
-- What it may and may not say is enforced in the prompt (`PERSONALITY_VOICE.menace`):
-- it bosses what the person does, never what they are, and never towards eating less.
--
-- Dropped by definition rather than by name, as in 20260920130000, so this works
-- whether or not 20260920140000 (hype) has been applied first.
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
    'feisty', 'cute', 'sweet', 'savage', 'hype', 'menace',
    -- retired, still worn by pets adopted before them
    'energetic', 'chill', 'competitive', 'supportive'
  ));
