# Vitto (React Native)

The Vitto app, migrated from the Vite web build to React Native via Expo.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npx expo start               # then press i / a, or scan with Expo Go
```

`expo-camera` and `expo-image-picker` work in Expo Go. Anything needing a native
module beyond that (see *Not yet native* below) needs a development build:

```bash
npx expo run:ios       # requires Xcode
npx expo run:android   # requires Android Studio
```

## Layout (see the root README for the monorepo)

| Path | What it holds |
| --- | --- |
| `src/domain/` | Pure TypeScript: pet engine, decay, streaks, macro targets, brain games. Ported unchanged from the web build. |
| `src/services/` | Platform edges: Supabase, storage, meal analysis, food lookup, haptics. |
| `src/screens/` | One screen per flow: auth, onboarding, dashboard, profile, meal capture, mind gym, workout. |
| `src/components/` | Shared UI: pet avatar, nutrient ring, diary row, form primitives. |
| `src/theme.ts` | Colours and type scale, lifted from the web stylesheet. |

## What changed in the migration

- **Storage.** `localStorage` became AsyncStorage, so `LocalRepository` is async
  throughout and the first load happens in an effect rather than a state initialiser.
- **Auth.** Supabase stores its session in AsyncStorage, with `detectSessionInUrl`
  off since there is no URL to parse on device.
- **Meal photos.** The web sent a `File` from an `<input>`. Native picks a `file://`
  URI, reads it as base64, and decodes to an ArrayBuffer for Supabase storage.
- **Barcodes.** `@zxing/browser` became `expo-camera`'s built-in scanner.
- **Sound.** The Web Audio tones became haptics, the native idiom for the same beat.
- **Ids.** Hermes has no `crypto.randomUUID`, so the domain takes an injected
  generator (`src/domain/ids.ts`) that the app fills with `expo-crypto` at startup.
- **Animation.** The pet's CSS keyframes became `Animated` loops.
- **Env vars.** `VITE_*` became `EXPO_PUBLIC_*`.

## Not yet native

- **HealthKit is done on iOS** (`HealthKitProvider` in `src/services/`) — steps,
  workouts (e.g. from Strong), and meals (e.g. from MyFitnessPal) can be pulled
  in from Apple Health via "Connect Apple Health" in Profile. See
  [HEALTHKIT.md](./HEALTHKIT.md) for the design, its known limitations, and the
  manual device/build setup it needs — none of it has run on a real device yet.
- **Android still uses the mock provider.** Health Connect (Android's
  equivalent) needs its own provider implementing the same `HealthDataProvider`
  interface — see HEALTHKIT.md's "What this does not do" section.
- **Screen time** remains a placeholder. It needs `DeviceActivity` (iOS, plus an
  Apple entitlement) or `UsageStatsManager` (Android).

## Tests

```bash
npm test           # both suites
npm run test:domain  # vitest, pure domain logic
npm run test:ui      # jest-expo, renders screens
```

## Database

The Supabase schema lives in `../supabase`. These migrations are still unrun on the
live project — writes tolerate their absence but silently drop the columns:

```sql
alter table public.pets add column if not exists adopted_at timestamptz not null default now();
alter table public.profiles add column if not exists height_unit text not null default 'cm' check (height_unit in ('cm','ft'));
-- plus supabase/mind.sql and supabase/onboarding-survey.sql
```
