alter table public.pets add column if not exists adopted_at timestamptz not null default now();
