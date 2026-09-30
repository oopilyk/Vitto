-- Evolution is for keeps.
--
-- A pet's form used to be derived from its stats on every render, so a scholar
-- whose mind decayed (5 a day without Mind Gym) turned back into the base
-- animal after about four days. `evolved_build` records the specialism once a
-- pet has evolved; the app falls back to it when the stats drift back to even
-- (see `getPetBuild` / `lockEvolution` in packages/core/src/domain/pet.ts).
alter table public.pets
  add column if not exists evolved_build text
    check (evolved_build is null or evolved_build in ('runner', 'lifter', 'scholar'));

-- Lock in every pet that is evolved right now, with the same rule the app uses:
-- level 11+, and one stat at least 45 and at least 12 ahead of the other two.
update public.pets
set evolved_build = case
  when endurance >= 45 and endurance - strength >= 12 and endurance - coalesce(mind, 20) >= 12 then 'runner'
  when strength >= 45 and strength - endurance >= 12 and strength - coalesce(mind, 20) >= 12 then 'lifter'
  when coalesce(mind, 20) >= 45 and coalesce(mind, 20) - endurance >= 12 and coalesce(mind, 20) - strength >= 12 then 'scholar'
end
where evolved_build is null and level >= 11;

-- Friends see the pet's form too, so the projection carries it. Otherwise
-- identical to 20260927130000.
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
    'last_event_at', p.last_event_at,
    'adopted_at', p.adopted_at,
    'created_at', p.created_at
  );
$$;
