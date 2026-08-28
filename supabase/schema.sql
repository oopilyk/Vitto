create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  age integer check (age between 13 and 100),
  sex text check (sex in ('female', 'male', 'other')),
  height_cm numeric check (height_cm between 120 and 230),
  weight_kg numeric check (weight_kg between 30 and 300),
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  activity text check (activity in ('low', 'moderate', 'high')),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  created_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 18),
  species text not null check (species in ('cat', 'dog', 'bunny')),
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp between 0 and 100),
  health integer not null default 0 check (health between 0 and 100),
  energy integer not null default 0 check (energy between 0 and 100),
  happiness integer not null default 0 check (happiness between 0 and 100),
  nutrition integer not null default 0 check (nutrition between 0 and 100),
  strength integer not null default 0 check (strength >= 0),
  endurance integer not null default 0 check (endurance >= 0),
  recovery integer not null default 0 check (recovery between 0 and 100),
  mood text not null check (mood in ('bright', 'content', 'sleepy', 'hungry')),
  last_event_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index one_pet_per_user on public.pets(user_id);

create table public.health_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  type text not null,
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index health_events_user_occurred_idx on public.health_events(user_id, occurred_at desc);

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.health_events enable row level security;

create policy "Users manage their profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users manage their pet" on public.pets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their health events" on public.health_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, age, sex, height_cm, weight_kg, activity, goal)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email),
    (new.raw_user_meta_data->>'age')::integer,
    new.raw_user_meta_data->>'sex',
    (new.raw_user_meta_data->>'heightCm')::numeric,
    (new.raw_user_meta_data->>'weightKg')::numeric,
    new.raw_user_meta_data->>'activity',
    new.raw_user_meta_data->>'goal');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();