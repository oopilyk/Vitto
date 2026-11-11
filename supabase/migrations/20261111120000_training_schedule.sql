-- The training rotation (Push, Pull, Legs, Rest, looped), kept with the
-- routines it orders. Null until someone sets one up. Shape, checked by the app
-- (parseSchedule in packages/core): { days: [{ kind: 'routine', templateId } |
-- { kind: 'rest' }], startedOn: 'YYYY-MM-DD' }. The row's existing policies
-- already limit it to its owner.

alter table public.workout_templates
  add column if not exists schedule jsonb
    constraint workout_templates_schedule_size check (schedule is null or pg_column_size(schedule) <= 16384);
