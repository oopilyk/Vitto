-- strength and endurance were created with an open-ended `>= 0` check, but the
-- pet engine clamps both to 0-100. Clamp existing rows first: re-adding the
-- constraint before the update would fail on any legacy row above 100.
update public.pets set strength = least(strength, 100) where strength > 100;
update public.pets set endurance = least(endurance, 100) where endurance > 100;

alter table public.pets drop constraint if exists pets_strength_check;
alter table public.pets add constraint pets_strength_check check (strength between 0 and 100);

alter table public.pets drop constraint if exists pets_endurance_check;
alter table public.pets add constraint pets_endurance_check check (endurance between 0 and 100);
