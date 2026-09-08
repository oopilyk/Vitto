# Ambient cues

Two live signals, read only while the app is open, that let the pet react to
what the user is doing *right now*:

| Cue | Source | What the pet does |
| --- | --- | --- |
| Walking | Pedometer step deltas (`expo-sensors`, Core Motion / Android step counter) | Plays its walk/run band, as if exploring |
| At the gym | Distance from one saved coordinate (`expo-location`, foreground only) | A dumbbell is parked beside it |

The arithmetic — a rolling step-cadence window and a haversine radius check —
is pure and lives in `packages/core/src/domain/ambient.ts`, unit-tested without
a device. The platform edges are the two hooks in `mobile/src/services/ambient.ts`.

## Privacy rule

**Nothing is stored.** Walking is a few seconds of step deltas held in memory
and forgotten; the gym check keeps one position fix long enough to compare and
drops it. The only persisted value is the gym coordinate itself, saved on this
device (`LocalRepository`, key `vitto.gym`) and never sent to the server or the
profile row. There is no movement history and no location trail, and the code
should stay that way — it is the same stance as `SCREENTIME.md`.

## Permissions

Foreground only, on purpose. Both cues are meaningless when the pet is not on
screen, so neither needs "Always" location or background motion — the requests
that draw App Review scrutiny and user distrust.

- iOS: `NSMotionUsageDescription`, `NSLocationWhenInUseUsageDescription`
  (strings in `app.json`; the `expo-sensors` and `expo-location` plugins write
  the entitlements).
- Android: `ACTIVITY_RECOGNITION`, `ACCESS_FINE_LOCATION` /
  `ACCESS_COARSE_LOCATION`. Background location is explicitly disabled in the
  plugin config.

The motion prompt appears the first time the dashboard opens after a build with
the module; the location prompt appears only when the user taps "Set my gym to
here" in Profile. `useAtGym` never prompts on its own — if location was refused
it stays quiet rather than nagging on every launch.

## Dev

Both cues need a dev build (`npx expo prebuild` after the `app.json` change,
then `expo run:ios` / `run:android`) — Expo Go cannot load the native modules.
The dashboard's dev strip has an **AMBIENT** row (`Live · Walking · At gym`)
that forces either cue, so the animation and the prop can be checked at a desk.

## Not verified on-device

Written against the Expo module type definitions; neither hook has been run on
a phone from the machine this was authored on. The first on-device check is:
open the dashboard, walk ~20 steps, watch the pet start its walk band within a
couple of seconds and stop ~12s after you do.
