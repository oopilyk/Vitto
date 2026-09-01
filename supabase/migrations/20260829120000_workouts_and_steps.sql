create table if not exists public.workouts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  duration_minutes integer not null,
  stats jsonb not null,
  exercises jsonb not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_steps (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  steps integer not null check (steps >= 0),
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.workouts enable row level security;
alter table public.daily_steps enable row level security;
drop policy if exists "Users manage their workouts" on public.workouts;
create policy "Users manage their workouts" on public.workouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their daily steps" on public.daily_steps;
create policy "Users manage their daily steps" on public.daily_steps for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
