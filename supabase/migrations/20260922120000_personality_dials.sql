-- The five personality dials set at adoption (serious↔playful, gentle↔blunt,
-- calm↔energetic, wholesome↔sarcastic, independent↔clingy), each 0..1.
--
-- On the pet, like `personality` and `persona`, because the character travels
-- with the pet rather than the account. They are the seed the companion's
-- traits drift from; the companion reads them from the life context the phone
-- sends and re-seeds when they change (see `rebaseTraits`). Absent on pets
-- adopted before them, which keeps their temperament's own seed.
alter table public.pets
  add column if not exists personality_dials jsonb
    check (personality_dials is null or (
      jsonb_typeof(personality_dials) = 'object'
      and personality_dials ?& array['playful', 'blunt', 'energetic', 'sarcastic', 'clingy']
    ));
