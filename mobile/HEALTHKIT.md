# Apple Health integration

Lets Vitto pull in workouts and meals a user already logs in another app —
Strong, MyFitnessPal, Apple Fitness, a Garmin/Whoop/Oura sync, whatever they
use — without Vitto needing a deal or API integration with each one
individually. Neither Strong nor MyFitnessPal has a public developer API,
but both already write into Apple Health if the user enables that in their
own settings, and Apple Health is a platform any app can read from with
permission. That's the integration.

## What this does *not* do

- **Android.** This is iOS-only. `HealthDataProvider` (the interface both
  providers implement) was written so an Android `HealthConnectProvider` can
  be dropped in later without touching `App.tsx`'s call sites again, but no
  Health Connect code exists yet.
- **Full history import.** Each sync only looks back a rolling recent window
  (`RECENT_SYNC_WINDOW_HOURS` in `healthKitProvider.ts`, currently 48 hours),
  not a user's entire HealthKit history. See "Why not a full backfill?" below
  — this was a deliberate scope cut, not an oversight.
- **Background/automatic sync.** There's a "Sync now" button in Profile.
  Nothing runs while the app is closed. A real background sync would need
  `expo-task-manager` + a HealthKit anchored/observer query and is a bigger,
  separate feature.
- **Writing to Health.** Read-only. Vitto never writes anything back.

## Architecture

```
healthKitMapping.ts   Pure functions: raw HealthKit sample shapes → Vitto's
                       HealthEvent domain types. No native calls. Fully unit
                       tested (mobile/src/__tests__/healthKitMapping.test.tsx).

healthKitProvider.ts   Thin wrapper around react-native-health's callback API.
                       Implements HealthDataProvider. Cannot be unit tested —
                       it only does anything with a real device and real
                       Health data. Delegates all actual logic to the mapping
                       module above.

healthDataProvider.ts  The interface both HealthKitProvider and
                       MockHealthDataProvider implement, so App.tsx never has
                       to know which one it's holding.

App.tsx                Picks a provider by Platform.OS, owns the "Connect"
                       and "Sync now" actions, and — critically — decides the
                       sync window and processes imported events in
                       chronological order (see below).
```

### Why chronological order matters

The pet simulation isn't stateless: `applyTimeDecay` erodes energy/nutrition/
happiness based on time elapsed since `pet.lastEventAt`, and every processed
event moves `lastEventAt` forward. If imported events were fed through out of
order, an older event processed after a newer one would rewind
`lastEventAt`, and the next decay calculation would be wrong.

`syncAppleHealth` in `App.tsx` guards against this two ways:
1. It never asks HealthKit for anything **older than the pet's current
   `lastEventAt`** — only `max(recentWindowStart, lastEventAt)` forward.
2. Workouts and meals are merged and sorted ascending by `occurredAt`, then
   `recordEvent` is awaited one at a time (not `Promise.all`) so each one
   sees the previous one's updated pet state.

### Why not a full backfill?

Importing months of history would mean replaying hundreds of events through
`engine.apply`/`applyTimeDecay` in strict order — solvable, but a materially
bigger and riskier feature (get the ordering or batching wrong and you can
corrupt a real user's streak or XP). A rolling recent window sidesteps that
risk completely while still delivering the actual goal: Strong and
MyFitnessPal data shows up in Vitto without the user re-entering it. If you
want full backfill later, budget it as its own feature, not an extension of
this one.

### Why meals are reconstructed from separate samples

`react-native-health` doesn't expose a query for `HKCorrelation` ("this one
meal has these nutrients"). Each nutrient — calories, protein, carbs, fat,
fiber — comes back as its own independent sample series. Apps that log one
meal (MyFitnessPal included) write all of that meal's samples with the same
`startDate`, so `reconstructMealsFromNutrientSamples` groups by **exact
timestamp match** across the five series. This is a heuristic, not a
guarantee:
- A source app that doesn't write matching timestamps for one meal's
  nutrients will have that meal's macros show up fragmented or incomplete.
- A meal missing some nutrients (e.g. no fiber logged) still comes through,
  with the missing ones defaulting to zero.
- The grade/summary for imported meals comes from the same heuristic
  (`toMealAnalysis`) used for manually-searched foods — there's no food name,
  so it's labeled "Meal from Apple Health" rather than the AI/manual flows'
  actual food description.

### Dedup

Every workout gets `metadata.workoutId` set to its HealthKit sample UUID.
Every imported meal gets `metadata.externalId` set to its energy sample's
UUID (the anchor sample for that reconstructed meal). Before each sync,
`getKnownHealthKitExternalIds(events)` collects every id already recorded —
from *any* source, not just previous HealthKit syncs — and both provider
methods filter against it, so nothing is ever double-imported.

## What's already verified

- `tsc --noEmit` is clean across `mobile`, `web`, and `packages/core`.
- `packages/core` (48 tests), `mobile` (29 tests, 11 of them new) all pass.
- The mapping layer — the part with actual logic — has direct unit test
  coverage: rounding, strength/cardio classification, timestamp grouping,
  zero-defaulting for missing nutrients, and dedup filtering.

## What's NOT verified — and can't be, from here

I have no iOS device, simulator, or native build environment in this
session. Everything above the mapping layer (`healthKitProvider.ts`, the
Expo config plugin, the actual native calls) is written carefully against
`react-native-health`'s type definitions but has never actually run. Treat
first real-device testing as the point this becomes trustworthy, not this
document.

## What you need to do

1. **Get real health data flowing into the phone first.** Install Strong
   and/or MyFitnessPal, log a workout and a meal in each, and in *their*
   settings enable syncing to Apple Health (Strong: Settings → Apple Health;
   MyFitnessPal: More → Settings → Apple Health). Without this there's
   nothing for Vitto to read.

2. **Build a dev client — Expo Go will not work.** This uses a native
   module, so:
   ```bash
   cd mobile
   npx expo prebuild -p ios      # generates the ios/ Xcode project with the
                                  # HealthKit entitlement + Info.plist strings
                                  # already wired in via app.json's plugin config
   npx expo run:ios               # builds and installs on a simulator or
                                  # connected device
   ```
   or, for a shareable build without a local Xcode setup:
   ```bash
   eas build --profile development --platform ios
   ```

3. **Check the Apple Developer portal.** Your App ID (`com.vitto.app`) needs
   the HealthKit capability enabled (Certificates, Identifiers & Profiles →
   Identifiers → your App ID → capabilities). EAS Build usually provisions
   this automatically from `app.json`, but if the build fails on a
   provisioning/entitlement error, this is the first thing to check manually.

4. **Test on a real device if you can.** The iOS Simulator's Health app lets
   you manually add sample workout/nutrition data for testing, but a real
   device with your actual Strong/MyFitnessPal history is the real test —
   and the only way to find out if the "same timestamp" meal-grouping
   heuristic actually holds for how those apps write their data, which I
   can't verify myself.

5. **Walk through it once, end to end:** open Vitto → Profile → "Connect
   Apple Health" → grant permission at the system prompt → confirm the
   status flips to "Connected" and a first sync runs → check that a workout
   and a meal you logged in Strong/MyFitnessPal show up in the dashboard
   diary, tagged with the ♥ "Apple Health" badge.

6. **Before App Store submission**, re-read Guideline 5.1.3 (health data) and
   make sure your privacy policy mentions Apple Health specifically — Apple
   reviews this closely, and rejections here are common even for compliant
   apps if the privacy policy is vague. Read-only access with no ad/analytics
   use (which is what's built here) is the easy case, but it still needs to
   be stated.

## If something doesn't work

- **Permission prompt never appears**: usually a signing/entitlement issue —
  re-run `expo prebuild` and check the generated
  `ios/Vitto/Vitto.entitlements` file actually has
  `com.apple.developer.healthkit: true`.
- **`getAnchoredWorkouts`/nutrient queries return empty**: confirm the source
  app's HealthKit sync is actually turned on (step 1) and that you granted
  read access for *all* the categories Vitto asks for — a partial grant
  (e.g. steps only) will silently return empty arrays for the rest, not an
  error.
- **A meal shows 0g for a macro you know you logged**: the timestamp-grouping
  heuristic didn't match that nutrient to the meal's energy sample. Confirms
  the known limitation above rather than a bug to chase blindly — check the
  actual `startDate` values for that meal's samples in the Health app if you
  want to confirm.
