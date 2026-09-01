alter table public.pets add column if not exists breed text check (breed in ('bichon', 'shiba'));
