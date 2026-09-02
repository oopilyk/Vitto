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
  separate feature. (The library's background-delivery entitlement is
  explicitly turned *off* in `app.json`'s plugin config — see below — since
  nothing here uses it yet.)
- **Writing to Health.** Read-only. Vitto never writes anything back.

## Library: @kingstinct/react-native-healthkit

This integration originally used `react-native-health`, a callback-based
HealthKit wrapper. **It doesn't work.** Its native methods never bridge to
JS under React Native's New Architecture (the default in RN 0.86 / Expo SDK
57, which this project is on) — `AppleHealthKit.initHealthKit` resolved to
`undefined` at runtime on a real device, confirmed via diagnostic logging in
Metro. `AppleHealthKit.Constants` (pure static JS data, no bridging
required) was fully populated, which is what pinned down that it was
specifically the New-Arch bridge that was broken, not permissions or
entitlements.

It was replaced with `@kingstinct/react-native-healthkit` (+ its peer
dependency `react-native-nitro-modules`), a Promise-based library built on
Nitro Modules — Nitro is designed for the New Architecture from the ground
up, so this doesn't hit the same wall. The public API this codebase uses
(`requestAuthorization`, `queryQuantitySamples`, `queryWorkoutSamples`,
`isHealthDataAvailableAsync`) is otherwise very similar in shape to what
`react-native-health` offered, so the swap didn't change the product design
— see git history on `healthKitMapping.ts`/`healthKitProvider.ts` if you
want the exact diff.

## Architecture

```
healthKitMapping.ts   Pure functions: raw HealthKit sample shapes → Vitto's
                       HealthEvent domain types. No native calls. Fully unit
                       tested (mobile/src/__tests__/healthKitMapping.test.tsx).

healthKitProvider.ts   Thin wrapper around @kingstinct/react-native-healthkit's
                       Promise-based query API. Implements HealthDataProvider.
                       Cannot be unit tested — it only does anything with a
                       real device and real Health data. Delegates all actual
                       logic to the mapping module above.

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

HealthKit has no query for "give me this correlated meal with all its
nutrients as one object" that this library exposes for reads. Each nutrient
— calories, protein, carbs, fat, fiber — comes back as its own independent
quantity sample series. Apps that log one meal (MyFitnessPal included) write
all of that meal's samples with the same `startDate`, so
`reconstructMealsFromNutrientSamples` groups by **exact timestamp match**
across the five series. This is a heuristic, not a guarantee:
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

## What's verified

- `tsc --noEmit` is clean across `mobile`, `web`, and `packages/core`.
- The full mobile test suite (34 tests, including the 11 for the mapping
  layer) passes.
- The mapping layer — the part with actual logic — has direct unit test
  coverage: rounding, strength/cardio classification, timestamp grouping,
  zero-defaulting for missing nutrients, and dedup filtering.
- The app has been built and installed on a real physical iPhone
  (`expo run:ios --device`) with the HealthKit entitlement present and no
  provisioning errors.

**Still to confirm on-device after the library swap**: that "Connect Apple
Health" actually completes and pulls real Strong/MyFitnessPal data through
end-to-end with `@kingstinct/react-native-healthkit`. The previous library's
failure mode (silent `undefined` methods) only surfaced through real-device
testing, not `tsc`/unit tests — so treat this integration as trustworthy only
after that walkthrough, not before.

## Real-world lessons from getting this running

These are things that only showed up building and testing on an actual
device, not from documentation — worth knowing if this breaks again later:

- **The iOS Simulator cannot test HealthKit at all.** Entitlements are not
  embedded in Simulator builds (`codesign -d --entitlements - <app>` shows an
  empty `[Dict]` even on a build that works fine on a real device). If
  "Connect Apple Health" fails with no permission dialog ever appearing on
  Simulator, that's expected — it's not a bug, test on a real device.
- **A free "Personal Team" Apple ID can use HealthKit, but not Health
  Records.** Plain read access to steps/workouts/nutrition works fine on a
  personal team. The **Clinical Health Records** capability
  (`com.apple.developer.healthkit.access` with clinical-record types) is
  blocked for personal teams and will fail provisioning. Both this library's
  and the previous library's config plugins only add that key when clinical
  data types are explicitly requested — this app never requests them, so it
  isn't affected — but if that error resurfaces, check the generated
  `ios/Vitto/Vitto.entitlements` for that key and confirm nothing added it.
- **Developer Mode must be manually enabled** on iOS 16+ real devices before
  a dev-signed build will launch (Settings → Privacy & Security → Developer
  Mode → toggle on → restart → confirm). `expo run:ios --device` will hang
  with "Timed out waiting for all destinations" until this is done.
- **`ApplicationVerificationFailed` on install** usually means a
  differently-signed previous copy of the app is still on the phone —
  delete it first, then reinstall.
- **"Untrusted Developer" on first launch** is normal for any non-App-Store
  dev build — Settings → General → VPN & Device Management → trust your
  developer certificate.

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
   npx expo run:ios --device      # builds and installs on a connected real
                                   # device (required — see Simulator note above)
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

4. **Test on a real device — required, not optional.** See the Simulator
   limitation above. A real device with your actual Strong/MyFitnessPal
   history is also the only way to find out if the "same timestamp"
   meal-grouping heuristic actually holds for how those apps write their
   data.

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

- **Permission prompt never appears**: on Simulator, this is expected (see
  above) — test on a real device. On a real device, it's usually a
  signing/entitlement issue — re-run `expo prebuild` and check the generated
  `ios/Vitto/Vitto.entitlements` file actually has
  `com.apple.developer.healthkit: true`.
- **`queryWorkoutSamples`/nutrient queries return empty**: confirm the source
  app's HealthKit sync is actually turned on (step 1) and that you granted
  read access for *all* the categories Vitto asks for — a partial grant
  (e.g. steps only) will silently return empty arrays for the rest, not an
  error.
- **A meal shows 0g for a macro you know you logged**: the timestamp-grouping
  heuristic didn't match that nutrient to the meal's energy sample. Confirms
  the known limitation above rather than a bug to chase blindly — check the
  actual `startDate` values for that meal's samples in the Health app if you
  want to confirm.
- **A native method appears to silently do nothing (no error, no data)**:
  this is exactly the failure mode that took down `react-native-health` under
  the New Architecture. Add a temporary log of `typeof <the library's default
  export>` and `typeof <the specific function>` right before the call — if
  the function is `undefined` despite the import succeeding, that's a
  bridging problem, not a permissions problem, and no amount of entitlement
  or provisioning fiddling will fix it.
