-- Workout routines, kept with the account.
--
-- They lived only in the phone's storage, which signing out wipes (so the next
-- person on the phone does not see them), as does a reinstall or a new phone.
-- Testers lost their routines that way. One row per person holds the list, as
-- the app already treats it: a short array (MAX_WORKOUT_TEMPLATES, 12) that is
-- read and written whole.

create table if not exists public.workout_templates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  templates jsonb not null default '[]'::jsonb
    constraint workout_templates_is_array check (jsonb_typeof(templates) = 'array')
    -- Twelve routines with every exercise and set are tens of kilobytes at most.
    constraint workout_templates_size check (pg_column_size(templates) <= 262144),
  updated_at timestamptz not null default now()
);

alter table public.workout_templates enable row level security;

drop policy if exists "Own workout templates: read" on public.workout_templates;
create policy "Own workout templates: read" on public.workout_templates
  for select using (auth.uid() = user_id);

drop policy if exists "Own workout templates: create" on public.workout_templates;
create policy "Own workout templates: create" on public.workout_templates
  for insert with check (auth.uid() = user_id);

drop policy if exists "Own workout templates: update" on public.workout_templates;
create policy "Own workout templates: update" on public.workout_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own workout templates: delete" on public.workout_templates;
create policy "Own workout templates: delete" on public.workout_templates
  for delete using (auth.uid() = user_id);
