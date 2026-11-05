-- More voices for the pet: a super deep one, squeaky and fast versions of the
-- Girl and Boy voices, and Santa (PET_VOICES in packages/core/src/domain/pet.ts).
--
-- Builds from before these read any value they do not know as "not picked"
-- and fall back to the voice from the pet's id, so a new value never breaks
-- an older phone; they also never write the column back unless they set it.

alter table public.pets drop constraint if exists pets_voice_check;
alter table public.pets
  add constraint pets_voice_check
  check (voice in ('female', 'male', 'deep', 'squeaky-female', 'squeaky-male', 'fast-female', 'fast-male', 'santa'));
