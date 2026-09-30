-- Every evolution a pet has earned, and the one it wears.
--
-- `evolved_build` (20260930120000) is the specialism the pet last grew into.
-- `earned_builds` keeps all of them, because a pet that has earned every form
-- may wear whichever it likes, and `chosen_build` is that pick. The app only
-- honours the pick once all three are earned (`canSwitchForm` in pet.ts).
alter table public.pets
  add column if not exists earned_builds text[]
    check (earned_builds is null or earned_builds <@ array['runner', 'lifter', 'scholar']::text[]),
  add column if not exists chosen_build text
    check (chosen_build is null or chosen_build in ('runner', 'lifter', 'scholar'));

-- A pet that has already evolved has earned that form.
update public.pets
set earned_builds = array[evolved_build]
where evolved_build is not null and earned_builds is null;

-- Friends see the form the pet wears, so the projection carries both.
-- Otherwise identical to 20260930120000.
create or replace function public.friend_pet_json(p public.pets)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'name', p.name,
    'species', p.species,
    'breed', p.breed,
    'personality', p.personality,
    'level', p.level,
    'xp', p.xp,
    'health', p.health,
    'energy', p.energy,
    'happiness', p.happiness,
    'nutrition', p.nutrition,
    'strength', p.strength,
    'pushing_strength', p.pushing_strength,
    'pulling_strength', p.pulling_strength,
    'leg_strength', p.leg_strength,
    'endurance', p.endurance,
    'recovery', p.recovery,
    'mind', p.mind,
    'mood', p.mood,
    'evolved_build', p.evolved_build,
    'earned_builds', p.earned_builds,
    'chosen_build', p.chosen_build,
    'last_event_at', p.last_event_at,
    'adopted_at', p.adopted_at,
    'created_at', p.created_at
  );
$$;
