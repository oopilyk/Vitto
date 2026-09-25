-- Push notifications: letting the pet speak when the app is closed.
--
-- The companion already decides WHETHER and WHY to speak (see `triggers.ts` in
-- packages/core/src/companion). Until now that decision could only be acted on
-- while the app was open, so the pet could only ever reach someone who was
-- already coming. These two pieces are what a scheduled job needs to act on it
-- from the outside:
--
--   1. `push_devices`  -- where to send, and when it is rude to.
--   2. `companion_state.last_life` -- what the pet knows about their day.
--
-- WHY THE CACHED CONTEXT. Every companion request carries a `LifeContext` the
-- PHONE builds -- pet stats, today's totals, the local clock -- because those
-- come from the app's own screens. A server-side job has no phone to ask, so
-- the most recent one is kept here and re-read later. It goes stale, and that
-- is accounted for rather than ignored: the notification job only fires the
-- triggers whose meaning survives staleness (absence, a remembered event), and
-- it tells the model how old the day figures are. See `notify/index.ts`.

create table if not exists public.push_devices (
  -- The Expo push token IS the device. Re-registering the same device replaces
  -- the row rather than accumulating duplicates, which is what upsert wants.
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'unknown')),
  -- Minutes east of UTC (New York in summer is -240). The job runs on UTC and
  -- every rule the pet uses is about the user's evening, not the server's.
  utc_offset_minutes integer not null default 0
    check (utc_offset_minutes between -840 and 840),
  enabled boolean not null default true,
  -- Local hours. A pet that wakes somebody at 3am is uninstalled by 3:01am.
  -- Wrapping is normal and intended: 22 -> 8 is "quiet overnight".
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check (quiet_end between 0 and 23),
  last_push_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id) where enabled;

alter table public.push_devices enable row level security;

-- Read your own; write nothing directly. Same rule as the companion tables
-- (20260920120000): the edge function is the only writer, with the service
-- role. It matters more here than elsewhere -- a client that could insert rows
-- could point somebody else's push token at its own pet and have their phone
-- light up with a stranger's notifications.
drop policy if exists "Owners read their push devices" on public.push_devices;
create policy "Owners read their push devices" on public.push_devices
  for select using (auth.uid() = user_id);

-- The last life context the phone sent, and when. Null until the app has
-- talked to the companion at least once, which is also the signal that this
-- pairing has nothing worth notifying about yet.
alter table public.companion_state
  add column if not exists last_life jsonb,
  add column if not exists last_life_at timestamptz;
