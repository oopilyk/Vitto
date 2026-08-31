alter table public.profiles add column if not exists target_weight_kg numeric check (target_weight_kg between 30 and 300);
alter table public.profiles add column if not exists goal_pace text not null default 'steady' check (goal_pace in ('gentle', 'steady', 'focused'));
alter table public.profiles add column if not exists training_days_per_week integer not null default 3 check (training_days_per_week between 0 and 7);
alter table public.profiles add column if not exists training_style text not null default 'mixed' check (training_style in ('strength', 'cardio', 'mixed'));
alter table public.profiles add column if not exists focus_areas text[] not null default array['nutrition', 'training', 'movement', 'mind'];
