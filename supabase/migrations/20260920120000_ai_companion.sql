-- The AI companion: the pet as a character with a memory, a mood, a personality
-- that drifts, and a relationship with one person.
--
-- KEYED BY (user_id, pet_id), NOT BY PET. A pet can be shared between two care
-- partners, and everything here is one person's private relationship with it:
-- what they told it, what it remembers about them, how close the two of them are.
-- None of that may ever reach the other carer. The same rule the rest of the
-- schema applies to `health_events` (see 20260907120000_care_partners.sql,
-- "Privacy") applies here, only more so: a memory is free text a person typed in
-- confidence. Keying per person also means the two carers never contend for a row.
--
-- WRITES ARE SERVER-ONLY. Every table below has a SELECT policy for its owner and
-- NO insert/update/delete policy, so the only writer is the `companion` edge
-- function using the service role. That is deliberate, not an omission:
--   * the function is where the model is called, so it is the only thing that can
--     honestly say what the pet said;
--   * usage caps and the (future) paywall are enforced there, and a client that
--     could write its own rows could simply grant itself more;
--   * relationship and personality are earned, and a writable row is a cheat code.
-- A person can still READ everything the pet holds about them, which is what the
-- chat screen and any future "what do you know about me" view use.

create table if not exists public.companion_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  personality_traits jsonb not null,
  mood text not null default 'curious',
  mood_intensity real not null default 0.6,
  mood_reason text not null default '',
  affection real not null default 0.3 check (affection between 0 and 1),
  trust real not null default 0.2 check (trust between 0 and 1),
  relationship_score real not null default 0 check (relationship_score >= 0),
  relationship_level text not null default 'STRANGER'
    check (relationship_level in ('STRANGER', 'ACQUAINTANCE', 'FRIEND', 'CLOSE_FRIEND', 'BONDED')),
  relationship_summary text not null default 'You just met.',
  user_nickname text check (user_nickname is null or char_length(user_nickname) <= 24),
  last_interaction_at timestamptz not null default now(),
  last_proactive_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, pet_id)
);

create table if not exists public.companion_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  category text not null check (category in (
    'preference', 'goal', 'routine', 'activity', 'relationship', 'importantEvent', 'healthHabit', 'conversationFact')),
  content text not null check (char_length(content) between 1 and 280),
  importance real not null check (importance between 0 and 1),
  confidence real not null check (confidence between 0 and 1),
  reference_count integer not null default 0,
  -- Low-importance memories expire; important ones persist (null).
  expires_at timestamptz,
  -- For importantEvent: the day it happens, so the pet can ask how it went.
  event_date date,
  followed_up_at timestamptz,
  source text not null default 'extraction' check (source in ('extraction', 'event')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_referenced_at timestamptz not null default now()
);
create index if not exists companion_memories_owner_idx
  on public.companion_memories (user_id, pet_id) where active;

create table if not exists public.companion_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  role text not null check (role in ('user', 'pet')),
  content text not null check (char_length(content) between 1 and 4000),
  source text not null default 'reply' check (source in ('reply', 'proactive')),
  trigger_key text,
  -- Token usage as the API reported it, on pet messages only:
  --   { model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
  -- This is what makes the running cost of the feature a query rather than a
  -- guess, and what a pricing decision should be read off.
  usage jsonb,
  created_at timestamptz not null default now()
);
-- Both the chat history and the per-day usage count read newest-first by owner.
create index if not exists companion_messages_owner_idx
  on public.companion_messages (user_id, pet_id, created_at desc);
create index if not exists companion_messages_usage_idx
  on public.companion_messages (user_id, created_at desc) where role = 'user';

create table if not exists public.companion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  type text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  -- Set once the pet has spoken about this event, or it was not worth a reaction.
  reacted_at timestamptz
);
create index if not exists companion_events_owner_idx
  on public.companion_events (user_id, pet_id, occurred_at desc);

-- THE PAYWALL SEAM. Today this table is empty and every account is 'free', with
-- the feature open to all. When billing arrives, a payment webhook (RevenueCat,
-- Stripe) upserts a row here with the service role, and the edge function -- which
-- already reads it on every request -- starts granting that account the larger
-- allowance. Nothing else has to change.
--
-- It is its own table rather than a column on `profiles` for one reason:
-- `profiles` is writable by its owner ("Users manage their profile", for all), so
-- a tier stored there is a tier anyone could set for themselves.
create table if not exists public.companion_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'plus')),
  -- Null means it does not lapse. A lapsed row reads as 'free'.
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.companion_state enable row level security;
alter table public.companion_memories enable row level security;
alter table public.companion_messages enable row level security;
alter table public.companion_events enable row level security;
alter table public.companion_entitlements enable row level security;

-- Read your own; write nothing. See the header for why there are no write policies.
drop policy if exists "Owners read their companion state" on public.companion_state;
create policy "Owners read their companion state" on public.companion_state
  for select using (auth.uid() = user_id);
drop policy if exists "Owners read their companion memories" on public.companion_memories;
create policy "Owners read their companion memories" on public.companion_memories
  for select using (auth.uid() = user_id);
drop policy if exists "Owners read their companion messages" on public.companion_messages;
create policy "Owners read their companion messages" on public.companion_messages
  for select using (auth.uid() = user_id);
drop policy if exists "Owners read their companion events" on public.companion_events;
create policy "Owners read their companion events" on public.companion_events
  for select using (auth.uid() = user_id);
drop policy if exists "Owners read their companion entitlement" on public.companion_entitlements;
create policy "Owners read their companion entitlement" on public.companion_entitlements
  for select using (auth.uid() = user_id);
