-- The user's own daily screen-time budget, in minutes. Nullable on purpose: no
-- budget is a real state (the pet engine scores a screen-time log as neutral
-- then), and the app never imposes one. Bounded to a day.
alter table public.profiles add column if not exists screen_time_budget_minutes integer
  check (screen_time_budget_minutes between 1 and 1440);
