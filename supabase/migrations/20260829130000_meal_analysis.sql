insert into storage.buckets (id, name, public) values ('meal-images', 'meal-images', false)
on conflict (id) do nothing;

create table if not exists public.meal_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.meal_analyses enable row level security;
drop policy if exists "Users manage their meal analyses" on public.meal_analyses;
create policy "Users manage their meal analyses" on public.meal_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users upload their meal images" on storage.objects;
create policy "Users upload their meal images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Users read their meal images" on storage.objects;
create policy "Users read their meal images" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Users delete their meal images" on storage.objects;
create policy "Users delete their meal images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
