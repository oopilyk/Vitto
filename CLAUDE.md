# Vitto — Claude Project Instructions

## Project Overview

Vitto is a health + virtual pet app.

The app combines:
- fitness tracking
- nutrition/macros
- gym/workout tracking
- step tracking
- screen-time related behavior
- virtual pet care
- pet stats
- pet evolution/progression
- social/community features

Healthy user behavior should improve the pet's stats and progression.

## Repository Structure

- `mobile/` — React Native / Expo mobile application
- `web/` — web application
- `packages/` — shared code, types, utilities, and components
- `supabase/` — database, migrations, functions, and backend configuration

Before making changes, inspect the relevant existing code and follow current project conventions.

## General Engineering Rules

1. Do not rewrite working code unnecessarily.
2. Prefer small, focused changes over large refactors.
3. Reuse existing components, utilities, and patterns before creating new ones.
4. Avoid adding dependencies unless there is a clear reason.
5. Preserve backward compatibility unless the task explicitly requires breaking changes.
6. Never commit secrets, private keys, service-role keys, or credentials.
7. Do not modify unrelated files.
8. Do not delete existing functionality without explicit reason.
9. Prefer strong typing and shared TypeScript types where appropriate.
10. Run relevant tests/type checks before declaring work complete.

## HealthKit Integration — Status (as of 2026-09-02)

Full design/architecture doc: [mobile/HEALTHKIT.md](mobile/HEALTHKIT.md). This
section is the short "where things stand, pick up here tomorrow" version.

### What's done and working

- Apple Health integration is built on `@kingstinct/react-native-healthkit`
  (a Nitro Modules library — built for React Native's New Architecture).
- **A previous attempt used `react-native-health`, which did not work**: its
  native methods never bridged to JS under the New Architecture
  (`AppleHealthKit.initHealthKit` was `undefined` at runtime on-device). That
  library was fully removed and replaced; see HEALTHKIT.md's "Library"
  section for the full story.
- Confirmed on Owen's physical iPhone: the app builds, installs, launches,
  and **"Connect Apple Health" successfully shows the real system permission
  dialog and completes** — this is the fix working.
- Confirmed: tapping "Sync steps" also runs without error and does something
  (see "Needs follow-up" below for exactly what).
- `tsc --noEmit` clean across `mobile`/`web`/`packages/core`. Full mobile
  test suite passes (34 tests, 11 of them for the new HealthKit mapping
  layer in `mobile/src/__tests__/healthKitMapping.test.tsx`).

### Needs follow-up tomorrow

Owen reported: after tapping "Sync steps," **calories did not update**. This
is very likely expected behavior, not a bug — worth confirming, not assuming:

- There are **two separate sync actions** in this app:
  1. **"Sync steps"** (on the main dashboard) — only calls
     `HealthKitProvider.getTodaySteps()`. It only ever affects the pet's
     `energy`/`happiness`/`endurance`/`xp` stats (see
     `packages/core/src/domain/petHealthEngine.ts`, the `STEP_ACTIVITY`
     case). **It does not touch meals, macros, or calories at all** — that's
     by design, not a bug.
  2. **"Connect Apple Health" / "Sync now"** (in Profile) — calls
     `syncAppleHealth()` in `App.tsx`, which pulls **both workouts and
     meals** (via `getNewWorkouts`/`getNewMeals`) from the last 48 hours and
     is the action that would actually bring in calorie/macro data from
     MyFitnessPal.
- **Next step**: confirm with Owen whether he tapped "Sync steps" (dashboard)
  or "Sync now" (Profile, under Apple Health). If it was "Sync steps," that
  explains the calorie question directly — have him try "Sync now" in
  Profile instead, with a MyFitnessPal meal already synced into Apple Health
  first (see HEALTHKIT.md step 1).
- Also worth checking: the step-sync stat bump is genuinely small (+3
  energy/+4 happiness/+1 endurance/+8 xp, roughly double if over 8,000
  steps) and there's no dedicated "steps" row in any diary — only a brief
  reaction message and a small stat-bar movement. If Owen expected something
  more visible, that's a product/UX question (is this bump noticeable
  enough?), not necessarily a defect.

### To resume tomorrow

1. Ask Owen which sync button he used, and whether calories show up after
   using "Sync now" in Profile (with Apple Health meal data actually
   present — MyFitnessPal set to sync to Apple Health, per HEALTHKIT.md
   step 1).
2. If "Sync now" also doesn't bring in calories, check Metro logs for
   errors from `getNewMeals`/`reconstructMealsFromNutrientSamples`, and
   confirm real nutrient samples exist in the iPhone's Health app for the
   sync window (last 48h) with matching timestamps across energy/protein/
   carbs/fat/fiber (the meal-reconstruction heuristic — see HEALTHKIT.md).
3. No code changes are pending from tonight's session — the library swap
   itself is complete, tested, and confirmed installed on-device. This is a
   verification/UX follow-up, not unfinished implementation work.

### Setup already done on Owen's machine/phone (don't redo)

- Xcode 26.3 installed, CocoaPods 1.17.0 installed, iOS simulator runtime
  downloaded.
- Signed into Apple ID in Xcode (free Personal Team) — code signing works.
- iPhone: Developer Mode enabled (Settings → Privacy & Security → Developer
  Mode), and the dev-signed build is trusted (Settings → General → VPN &
  Device Management).
- App is currently installed and running on Owen's iPhone via
  `npx expo run:ios --device 00008140-000170E63C2A801C` from `mobile/`.
- To rebuild after further code changes: `cd mobile && npx expo run:ios
  --device` (device auto-detected if only one is connected). Re-run `npx
  expo prebuild -p ios` first only if `app.json`'s native config
  (permissions, plugins, entitlements) changed.

