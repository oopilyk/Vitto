alter table public.pets add column if not exists mind integer not null default 20 check (mind between 0 and 100);
