-- The pet's voice: whose voice it speaks in when the phone reads its lines
-- aloud (mobile/src/voice). Picked in Settings by anyone who looks after the
-- pet, so both care partners hear the same pet.
--
-- Null until picked: the phone then picks one from the pet's id, the same on
-- every phone. Clients send the column only once it is set, so a build from
-- before it never clears it.

alter table public.pets
  add column if not exists voice text
  check (voice in ('female', 'male'));
