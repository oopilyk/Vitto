# Vitto

A health tracker where your habits raise a pet. One shared brain, two apps.

```
packages/core/   @vitto/core — domain logic + Supabase-backed services (shared)
web/             Vite + React web app
mobile/          Expo + React Native app
supabase/        SQL schema and the analyze-meal edge function
```

## Getting started

```bash
npm install            # installs every workspace and links @vitto/core

npm run web            # Vite dev server
npm run mobile         # Expo — scan the QR with Expo Go (needs 57.0.9+)

npm test               # every workspace's tests
npm run typecheck      # every workspace
```

Each app carries its own `.env.local` (copy from the `.env.example` beside it):
`VITE_*` for web, `EXPO_PUBLIC_*` for mobile.

## What lives where

**`packages/core`** is everything that does not care what it is running on: the pet
engine, time decay, streaks, macro targets, calorie estimation, the brain games, and
the Supabase repository, auth, and food lookup. It has no React, no DOM, and no React
Native imports, so it type-checks and tests under plain Node.

Two seams keep it platform-free:

- **`configureCore({ supabase, envHint, fdcApiKey })`** — each app builds its own
  Supabase client (the browser's with default storage, the device's with AsyncStorage)
  and hands it in. Everything downstream just asks core for it.
- **`setIdGenerator(...)`** — the web installs `crypto.randomUUID`, native installs
  `expo-crypto`, because Hermes has no such global.

**`web/`** and **`mobile/`** hold only what is genuinely platform-specific: screens,
components, local storage, image handling, and sound/haptics.

## Tests

The shared logic is tested once, in `packages/core` (48 tests, vitest). `mobile` adds
three jest-expo tests that render real screens. Run them all with `npm test` at the root.

## Database

Migrations in `supabase/` still to be applied to the live project — writes tolerate
their absence, but silently drop those columns:

```sql
alter table public.pets add column if not exists adopted_at timestamptz not null default now();
alter table public.profiles add column if not exists height_unit text not null default 'cm' check (height_unit in ('cm','ft'));
-- plus supabase/mind.sql and supabase/onboarding-survey.sql
```

## Known gaps

- Steps are mocked in both apps (`MockHealthDataProvider`). Real steps need
  HealthKit / Health Connect and a native development build.
- Screen time is a placeholder in both.
- The pet is drawn from primitives, not a sprite.
