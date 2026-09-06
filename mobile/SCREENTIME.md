# Screen time

Lets the pet respond to how much of the day the user spent on their phone. The
product rule is the same as for sleep (see `petHealthEngine.ts`): a day under a
budget **the user set for themselves** restores the pet's `mind`; a day over it
costs nothing and is acknowledged with a few xp; a day with no budget set is a
neutral log. The app never imposes a budget and never scolds.

## Privacy rule

A `SCREEN_TIME` event stores **a minute total and a budget flag, nothing else**
(`ScreenTimeMetadata` in `packages/core/src/domain/health.ts`). No per-app
breakdown, app names, package ids or categories — not in the event, not across
the native bridge, not in logs. The Android module returns one summed number
for exactly this reason, and the mapping layer (`screenTimeMapping.ts`) only
accepts totals, so a breakdown cannot leak in by accident. The test suite
asserts the metadata key set.

## Where the number comes from, per platform

| Platform | Source | `metadata.source` | Status |
| --- | --- | --- | --- |
| iOS | User reads Settings → Screen Time and types it in (Profile → Screen time) | `manual` | Working (Phase 1) |
| Android | Typed in, **or** read from `UsageStatsManager` after granting usage access | `manual` / `usage_stats` | JS + mapping tested; Kotlin **unverified on-device** (Phase 2) |
| iOS, future | A `DeviceActivityMonitor` extension reports a crossed threshold | `thresholds` | Mapping only; no native code (Phase 3) |

One log per day is enforced in `App.tsx` (`assertScreenTimeNotLogged`, backed by
`findScreenTimeForDate`), keyed on `metadata.date` rather than `occurredAt` so a
total typed in after midnight still belongs to the day it describes.

## The iOS constraint (read before touching native code)

You cannot read Screen Time totals into JavaScript on iOS, and no library fixes
that. Apple's Screen Time stack is designed so the **host app never sees the
figures**:

- `FamilyControls` needs the `com.apple.developer.family-controls` entitlement,
  which is request-and-approve from Apple (a form, and a justification) before
  TestFlight/App Store builds can carry it. Its `FamilyActivityPicker` returns
  opaque tokens, never bundle ids.
- `DeviceActivityReport` renders usage **only inside a sandboxed report
  extension** whose view the app can embed but whose data it cannot read back.
- `DeviceActivityMonitor` runs in its own extension process and gets callbacks
  (`intervalDidStart`, `eventDidReachThreshold`, …) when the user crosses a
  threshold registered up front. That is the only signal that can reach the
  app, and it is a boolean-ish "crossed X minutes", not a total.
- HealthKit has no screen-time type at all.

This is how Apple documents FamilyControls, DeviceActivity and
DeviceActivityReport (see the framework reference for each); nothing in this
repo has exercised those APIs, so treat it as the documented contract rather
than something verified here. Either way, on iOS the design is
threshold-shaped, never "exact daily minutes".

## Android (Phase 2)

`UsageStatsManager.queryUsageStats(INTERVAL_DAILY, startOfToday, now)` gives
per-app foreground time once the user grants **usage access**, a "special app
access" switch in Settings (`Settings.ACTION_USAGE_ACCESS_SETTINGS`) rather
than a runtime prompt. The local Expo module in `mobile/modules/screen-time/`
(auto-linked: expo-modules-autolinking's default `nativeModulesDir` is
`./modules`) sums `totalTimeInForeground` for entries whose `lastTimeUsed` is
today and exposes:

- `hasUsageAccess(): boolean`
- `openUsageAccessSettings(): void`
- `getForegroundMillisToday(): Promise<number>` — the total, and only the total

`mobile/modules/screen-time/index.ts` wraps it and returns `false`/`null`
wherever the module is absent (iOS, web, jest, a build before prebuild), and
`AndroidUsageStatsProvider` plugs that into `HealthDataProvider.getTodayScreenTime`.

**Unverified on-device.** There is no Android SDK on the machine this was
written on (`adb` absent, `ANDROID_HOME` unset), so the Kotlin has not been
compiled or run. To verify: `cd mobile && npx expo prebuild -p android && npx
expo run:android`, open Profile → Screen time → "Allow usage access", flip the
switch, return, tap "Read from this phone". Known approximation: daily buckets
are system-aligned, so an app used late last night and again today reports its
whole bucket — fine for a budget check.

## What Phase 3 would wire up (not started)

1. Request the Family Controls entitlement from Apple; add it to
   `app.json`/entitlements once granted.
2. A `DeviceActivityMonitor` app extension (Swift) that registers one
   `DeviceActivityEvent` per day with `threshold: budgetMinutes`, and in
   `eventDidReachThreshold` writes `{ thresholdMinutes, date }` to an App Group
   `UserDefaults` the main app can read.
3. On foreground, the app reads that record and calls `mapThresholdCrossing`
   (already in `screenTimeMapping.ts`, tested) → `recordEvent`. The event is
   `source: 'thresholds'`, `withinBudget: false`, `minutes` = the threshold (a
   floor). A day with no crossing is still logged manually, or inferred as
   "under" only if the user opts into that.

Until then, iOS is manual entry only, and that is the honest design.
