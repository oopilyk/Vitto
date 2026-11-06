# Vitto QA checklist — pass 1 (2026-11-06)

Build: Debug, simulator, local (offline) mode via Metro :8082. Two simulators at a time.

| Wave | Agent | Simulator | Focus |
|---|---|---|---|
| 1 | First-time user | iPhone 17 Pro (5062CC77) | Onboarding, first ten minutes, discoverability, copy |
| 1 | Bug hunter | iPhone 17 (DB1C1466) | Every control, forms, logging results, Maestro flows |
| 2 | UI reviewer | iPhone 17 Pro (5062CC77) | Light/dark/large text, consistency, polish |
| 2 | Edge-case tester | iPhone 17 (DB1C1466) | Rapid taps, interruptions, relaunch, odd input |
| — | QA lead (main session) | iPhone 17 Pro, after wave 2 | Dedupe, re-check High/Critical, regression runs, QA_REPORT.md |

## Areas

| Area | First-time | Bug hunter | UI review | Edge cases | Status |
|---|---|---|---|---|---|
| Launch / onboarding | ● | ○ | ● | ● (interrupt) | |
| Dashboard rooms, room switching | ● | ● | ● | ● | |
| Meal: search, scan, photo (Plus lock), Recent, servings | ● | ● | ● | ● (double submit) | |
| Workout: picker, sets, Last, ✓ rest timer, routines, cardio | ● | ● | ● | ● (background, relaunch) | |
| Water (Today) | ○ | ● | ● | ● (rapid taps) | |
| Word puzzle, Mind games | ○ | ● | ● | ● | |
| Today + Food/Step trends, Lift progress | ● | ● | ● | ○ | |
| Profile, Edit profile | ● | ● | ● | ● (long/emoji) | |
| Settings sub-pages (prefs, reminders, appearance, care areas, voice…) | ○ | ● | ● | ● | |
| Friends, pet chat | ● | ● | ● | ● (offline) | |
| Plus paywall (view only) | ○ | ● | ● | — | |
| Dark mode / large text | — | — | ● | — | |
| Kill & relaunch persistence | — | — | — | ● | |

● = primary owner, ○ = touched in passing.

## Out of scope / blocked this pass
- Sign-up, sign-in, password reset, real sync, friends with real accounts, push: need the real backend and a test account (local mode only).
- Apple Health, camera/AI photo, barcode, haptics, Live Activity, Home Screen widget: simulator can't exercise them meaningfully, or they need a device.
- Purchases: never.
