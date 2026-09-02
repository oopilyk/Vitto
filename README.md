# Vitto

A health tracker where your habits raise a pet. One shared brain, two apps.

```
packages/core/   @vitto/core — domain logic + Supabase-backed services (shared)
web/             Vite + React web app
mobile/          Expo + React Native app
supabase/        migrations and the analyze-meal edge function
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

Schema lives in `supabase/migrations/`, one timestamped SQL file per change, applied in
filename order:

```
20260828170000_initial_schema.sql     profiles, pets, health_events + RLS + new-user trigger
20260828170100_profile_columns.sql    profile body/goal columns
20260829120000_workouts_and_steps.sql workouts, daily_steps
20260829130000_meal_analysis.sql      meal_analyses + the meal-images storage bucket
20260830090000_pet_strength_stats.sql pets.pushing/pulling/leg_strength
20260830100000_pet_adopted_at.sql     pets.adopted_at
20260831120000_pet_mind_stat.sql      pets.mind
20260831130000_onboarding_survey.sql  profile survey columns
20260901140000_pet_breed.sql          pets.breed
20260901150000_pet_stat_bounds.sql    clamps pets.strength/endurance to 0-100
```

Every migration is written to be re-runnable (`if not exists` / `if exists` guards), so
applying the whole directory to a database that is already partly migrated is safe.

These replace the loose hand-run `supabase/*.sql` files the project started with
(`schema.sql`, `profile.sql`, `pet-stats.sql`, `adopted-at.sql`, and friends). Those files
are gone; do not add new SQL outside `migrations/`.

**Applied state is unverified.** The Supabase project is not linked locally — there is no
`supabase/config.toml` and no `.temp/project-ref`, and `supabase/.temp/pooler-url` still
carries the placeholder password — so nothing here has confirmed which migrations the live
project actually has. Check before trusting the schema:

```bash
supabase link --project-ref <your-project-ref>   # prompts for the database password
supabase migration list --linked                 # local vs. remote, side by side
```

This matters because `SupabaseRepository` writes through `saveDroppingMissingColumns`,
which retries a failed write with the offending column removed. A missing column therefore
costs you a silent data loss rather than an error: `loadPet` backfills `mind` to 20 and
`adopted_at` to "now", so an unmigrated database looks like a working one with oddly
default-looking stats. If a stat renders as its default and never persists, suspect an
unapplied migration first.

## Known gaps

- Steps are mocked in both apps (`MockHealthDataProvider`). Real steps need
  HealthKit / Health Connect and a native development build.
- Screen time is a placeholder in both.
- The pet is drawn from primitives, not a sprite.
