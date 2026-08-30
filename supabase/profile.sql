alter table public.profiles add column if not exists age integer check (age between 13 and 100);
alter table public.profiles add column if not exists sex text check (sex in ('female', 'male', 'other'));
alter table public.profiles add column if not exists height_cm numeric check (height_cm between 120 and 230);
alter table public.profiles add column if not exists height_unit text not null default 'cm' check (height_unit in ('cm', 'ft'));
alter table public.profiles add column if not exists weight_kg numeric check (weight_kg between 30 and 300);
alter table public.profiles add column if not exists weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb'));
alter table public.profiles add column if not exists activity text check (activity in ('low', 'moderate', 'high'));
alter table public.profiles add column if not exists goal text check (goal in ('lose', 'maintain', 'gain'));