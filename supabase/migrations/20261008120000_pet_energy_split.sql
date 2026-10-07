-- Energy and Vitality, split (see packages/core/src/domain/pet.ts).
--
-- `energy` keeps its name but now means Vitality: what workouts and walks
-- build. Energy proper, what sleep and meals fill, is the new `charge`. Every
-- existing pet starts it at a comfortable 70, so none wakes up sleepy.
--
-- Low Vitality has its own mood, 'sluggish'; 'sleepy' now means low Energy.

alter table public.pets add column if not exists charge integer not null default 70;

alter table public.pets drop constraint if exists pets_charge_range;
alter table public.pets add constraint pets_charge_range check (charge between 0 and 100);

-- The initial schema's inline check, by Postgres's generated name.
alter table public.pets drop constraint if exists pets_mood_check;
alter table public.pets add constraint pets_mood_check
  check (mood in ('bright', 'content', 'sleepy', 'sluggish', 'hungry'));
