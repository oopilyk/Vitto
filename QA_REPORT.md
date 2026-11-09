# Vitto iOS QA report: pass 1

**Date:** 2026-11-06 · **Build:** Debug, iOS Simulator (iOS 26.5), Expo SDK 57 / React Native 0.86 (New Architecture), served by Metro in **offline local mode** (Supabase off, so no real accounts or production data were touched).
**Tooling:** Maestro 2.12.1 for taps, typing and swiping; `simctl` for screenshots, appearance, text size and app lifecycle.
**Evidence:** `qa-artifacts/`. Each agent's full findings are in `qa-artifacts/<agent>/findings.md`, screenshots in `qa-artifacts/screenshots/<agent>/`, regression runs in `qa-artifacts/regression/`.

## Executive summary

| | |
|---|---|
| Testing sessions run on simulators | 4 agents, each driving a real simulator: first-time user, bug hunter, UI reviewer, edge-case tester. About 4.5 hours of interaction and 300+ screenshots. |
| Raw findings | 70 (FT 17, BH 16, UIR 23, EC 15) |
| Unique issues after merging duplicates | **47**: Critical 0 · High 6 · Medium 16 · Low 25 |
| Confirmed (reproduced, or verified in code) | 34 |
| Suspected (seen once, not re-run) | 13 |
| Testing artifacts, not app bugs | 3 (listed below) |
| Automated regression flows | 5 written, **5 passing**. All 5 failed at first because of selector problems in the flows themselves, not the app. |
| Blocked / untested | Sign-up and sign-in, sync, Friends, pet chat, AI photo, push, Apple Health, camera and barcode scanning, Live Activity, Home Screen widget, haptics, animation feel, purchases |

**Release readiness: not ready yet, but close.**
- Nothing crashes, and there's no data corruption from rapid taps. Duplicate submits were all prevented: meal, workout, water and word puzzle.
- Core logging works and the numbers land correctly on Today, Activity history and the pet's stats.
- What must change before release:
  - **One navigation bug** that can pop the wrong screen.
  - **One XP exploit.**
  - **Silent loss of an in-progress workout.**
  - **Missing input validation** that changes calorie targets.
  - **A visibly broken barcode permission screen.**
  - **The keyboard Done bar from today's changes**, which doesn't work.
- None of these is a large change.

### Fixed during this session
These were fixed at your request and are not counted above:
- **Word puzzle result card:** the label overflowed the score circle, and a meaningless "0" showed when unsolved.
- **Activity history:** the "Healthy moment" labels, water now shows one net row per day, and Mind games have their real names.
- **Shared pets:** taking water back no longer posts "had a drink" to the partner's feed.

### Fixed after the report (2026-11-07)
| Issue | Fix | Verified |
|---|---|---|
| VQA-001 double close | The screen closes itself after saving; App's extra `goBack()` is removed | Regression `log-workout` passes |
| VQA-002 meal XP farming | `mealXp`: 10 XP for the first 5 meals a day of ≥ 50 kcal, then 0 (core) | 4 new engine tests |
| VQA-003 workout lost on kill | Draft saved to AsyncStorage as it changes and restored on open ("Picked up where you left off."), cleared on finish or discard | Test; seen on the simulator after a kill |
| VQA-004 silent discard | Workout: "Leave this workout?" (Keep for later / Discard workout / Cancel). Meal: "Discard this meal?" | Tests; prompt seen on the simulator |
| VQA-005 impossible age/weight | Shared `bodyProblem` check (age 13–100, height 90–230 cm, weight 30–300 kg) blocks Save in Preferences; onboarding uses the same | Core tests |
| VQA-006 barcode permission layout | Its own button; "Open Settings" once access was refused | Test |
| VQA-007 no Done bar | `DoneTextInput`: every number field brings its own bar; Settings and onboarding wrappers add it for number pads | Tests; bar seen above the keypad on the simulator, Done closes it |
| VQA-008 back labels | Lift progress says "‹ Today" from Today; Settings says "‹ Pet" from the account menu | Regression `open-today` passes |

### Fixed after the report, second pass (2026-11-08)
Verified by tests and typecheck, then on the iPhone 17 Pro simulator (2026-11-08, local mode): the four regression flows pass, and these were checked by screenshot: decimal pad with Done typing 22.5 lb; Notes and Finish above the keyboard; workout draft restored; food search suggestions and live results; Profile "Progress ›" link and aligned record tiles; 30-day chart dates; compact Mind card; paywall × pinned after scrolling.

Found on the simulator and fixed: `SheetKeyboardAvoidingView` first measured the sheet's position, which reads 0 inside the navigator's sheet, so Finish stayed half covered; it now takes the offset as screen height less sheet height. The lift-limits change had added a strengthRanks ↔ workoutLimits import cycle (a dev warning toast on every launch); `estimatedOneRepMax` now lives in `oneRepMax.ts`. The regression flows' blind tap for the dev toast is now conditional (without a toast it hit the Study room button).

| Issue | Fix |
|---|---|
| VQA-007 decimal weights | `NumberInput` / `useNumberText` keep the typed text, so "22." stays and 22.5 can be entered. Decimal pad for set weights, Preferences weight and target, onboarding weight and goal |
| EC-5 keyboard over Notes | `SheetKeyboardAvoidingView` measures where the sheet sits on screen (the stock view came up short by the sheet's offset). Notes scroll into view on focus |
| Draft after logout | Logging out clears the workout draft |
| VQA-009 absurd lifts and runs | `checkWorkout` (core): refuses past human limits (e1RM > 600 kg, > 1,000 reps, > 24 h, impossible speed), asks above elite levels. PRs, ranks, run records and next session's prefill skip implausible entries already logged |
| VQA-010 step goal | Typed freely, saved on Done or blur, clamped to 1,000–100,000 |
| VQA-011 goal direction | Onboarding refuses a goal weight on the wrong side of current for "Lose fat" or "Build size" instead of relabelling the goal |
| VQA-012 plate stepper | − stops at ½; a separate × removes the food |
| VQA-013 0-kcal foods | Under 5 kcal (and not a treat) grades C, so no health cost and no Junk effect; a confident 0 kcal is not "incomplete" |
| VQA-015 Mind card | Pet gets an 84 pt square stage instead of the 320 pt default; sentence-case line |
| VQA-016 large text | Ring number capped at 1× (it is sized to the ring); paywall details, Settings values and rest label wrap; meal title wraps beside × |
| VQA-017 touch targets | Larger hit areas on set ✓, remove-set, rest buttons, Stats Share; account menu rows 44 pt |
| VQA-018 30-day chart | Dates every 7 days as free labels; selection follows the date across ranges; stronger small bars |
| VQA-019 paywall × | Bar pinned above the scroll |
| VQA-026 stale error | Cleared on edit; "Pick a month to go on." hint |
| VQA-028 per 100 g | Plate rows say the amount ("350 g") |
| VQA-029 macro rounding | Grams kept to a tenth per food; totals rounded where shown |
| VQA-030 water rounding | Fl oz to the half; cup label uses the same formatter |
| VQA-024 chip tap | Month chips take the first tap with the keypad up |
| VQA-033 emoji initial | `initialOf` takes a whole code point |
| VQA-035 name limit | "n / 40" near the limit; Save returns to Profile |
| VQA-038 puzzle status | Stats says "in progress" once a guess is made |
| VQA-039 exercise search | Name-prefix matches first |
| VQA-041 locked contrast | Only the sprite fades |
| VQA-044 PR tiles | Lift names get two lines' room |
| VQA-045 Voice Control | Labels match the visible text (flows and tests updated) |
| VQA-046 search spacing | Gap under the field; Recent title aligned |
| VQA-020 onboarding length | Cut three pages that asked nothing: "You chose the …!", "Let's learn a bit about you!" and the streak promise (never saved). A saved onboarding on one of them resumes on the page after |

Left open: decisions for the owner (VQA-014 theme rule, VQA-021 offline living room, VQA-022 copy, VQA-025 multi-select hint, VQA-031 measured duration, VQA-032 where a run counts, VQA-037 where the puzzle returns, VQA-040 USDA names, VQA-043 shared header). Not fixed: VQA-023 chip peek and VQA-042 Outdoors status bar (each needs a visual check), VQA-036 (water XP kept, can't be farmed), and VQA-027 / VQA-047 (unclear or likely testing artifacts).

## Bug reports

Sources are the raw IDs (FT = first-time user, BH = bug hunter, UIR = UI reviewer, EC = edge-case tester).

**Status:**
- **Confirmed:** reproduced at least twice, or seen once and verified in code.
- **Suspected:** seen once.

**Cause:**
- **Real:** would happen on a phone.
- **Partly sim:** the simulator makes it more likely to show.
- **Artifact:** a testing artifact, not an app bug.

### High

#### VQA-001: Finishing a workout closes the sheet twice
- **Sources:** FT-5, BH-14 · **Screen:** Workout › Finish workout · **Status:** Confirmed (2/2 on two simulators, plus the code) · **Cause:** Real
- **Steps:**
  1. Open the Gym room and tap Log workout.
  2. Add Bench Press.
  3. Tap Finish workout.
- **Expected:** The workout saves and the sheet closes once.
- **Actual:**
  - The workout saves, then a dev error appears: "The action 'GO_BACK' was not handled by any navigator."
  - `WorkoutScreen.finish()` calls `onFinish`. App's handler for it runs `navigation.goBack()` (App.tsx ~3205–3207), then `finish()` calls `onClose()`, which is `goBack()` again (WorkoutScreen.tsx ~357).
  - From the room, the second back has nowhere to go. Opened from another screen (for example Today), it would also pop that screen.
- **Evidence:** first-time/57, 58, 66; bug-hunter screenshots; code.
- **Fix:** Drop the `onClose()` call after a successful `onFinish`, or drop the `goBack()` in App's `onFinish`. Keep exactly one.

#### VQA-002: Meals give +10 XP each with no daily cap, so XP and coins can be farmed
- **Sources:** EC-1 · **Screen:** Meal sheet › Recent · **Status:** Confirmed (7/7 logs, plus the code) · **Cause:** Real
- **Steps:**
  1. Log "Beverages, water, tap" (0 kcal).
  2. Re-log it from Recent 7 times (about 3 taps each).
- **Expected:** Diminishing or capped XP per day, or nothing for a 0-kcal item.
- **Actual:**
  - Every log gives +10 XP. Food XP went from +35 to +105 and Today showed "10 meals".
  - It caused a level-up and +50 coins.
  - `petHealthEngine.ts` (MEAL case) awards a flat `xp: 10` with no per-day limit, unlike workouts (`WORKOUT_XP_CAP`) and mind training (`BRAIN_TRAINING_MAX_XP`).
  - The new one-tap Recent list makes this faster.
- **Evidence:** edge-cases screenshots; code.
- **Fix:** Cap meal XP per day (for example the first 4–5 meals), and give no XP below some calorie floor.

#### VQA-003: Killing the app loses an in-progress workout
- **Sources:** EC-2, EC-14 · **Screen:** Workout sheet (also the meal plate and a half-typed puzzle row) · **Status:** Confirmed · **Cause:** Real
- **Steps:**
  1. Add 50 sets and tick 2, with the rest timer running.
  2. Kill the app and relaunch.
- **Expected:** The draft workout is restored, or at least the user is warned.
- **Actual:**
  - Back to an empty "Log a workout".
  - Backgrounding for 30 s is fine: sets are kept and the timer keeps real time.
  - On a phone, iOS kills backgrounded apps often during a gym session.
- **Fix:** Persist the workout draft (exercises, sets, ticks, rest end time) to AsyncStorage on change, and restore it on open.

#### VQA-004: Closing a logging sheet discards work without asking
- **Sources:** UIR-2 · **Screen:** Workout and meal sheets · **Status:** Confirmed (1/1 each) · **Cause:** Real
- **Steps:**
  1. Add an exercise and tick a set (or put a food on the plate).
  2. Tap ×.
- **Expected:** A "Discard workout?" confirmation, or the draft kept.
- **Actual:** Closes immediately and reopens empty.
- **Fix:** Confirm before discarding when anything has been entered. VQA-003's draft storage would also cover this.

#### VQA-005: Your preferences accepts impossible age and weight, silently changing calorie targets
- **Sources:** BH-11 · **Screen:** Settings › Your preferences · **Status:** Confirmed (plus the code) · **Cause:** Real
- **Steps:**
  1. Set Age to 999 and save.
  2. Set Weight to 0 and save.
- **Expected:** A range check with a message, as the calorie goal field already has.
- **Actual:**
  - Both save. Age 999 dropped the daily target from 2,962 to 1,200 kcal.
  - In PreferencesScreen.tsx, only the calorie goal is range-checked; age and weight take any number.
  - The first Save attempt also gave no feedback. That may be the full disk, and wasn't re-checked.
- **Fix:** Validate age (13–100), weight, and height with inline errors, matching onboarding's checks.

#### VQA-006: Scan barcode tab: "Allow camera" layout is broken
- **Sources:** UIR-1 · **Screen:** Meal sheet › Scan barcode · **Status:** Confirmed (2/2, light and dark) · **Cause:** Partly sim
- **Steps:** Kitchen › Log meal › Scan barcode, without camera permission.
- **Expected:** A centred, normal-height button with padding around the title.
- **Actual:**
  - The button is about 78×128 pt with its label pinned to the top, and the title touches the dashed border.
  - The simulator always shows this state. On a phone, so does anyone who hasn't granted camera access or tapped Don't Allow.
- **Fix:** In MealCaptureScreen, the permission prompt reuses `styles.pickButton` (`flex: 1`) inside the 190 pt column of the dropzone. Give it its own non-flex style and padding.

### Medium

| ID | Issue | Sources | Status | Cause | Suggested fix |
|---|---|---|---|---|---|
| VQA-007 | **The keyboard "Done" bar never appears** above number pads (workout sets, preferences, onboarding). The pad covers Finish workout and the Notes field. Weight uses the whole-number pad, so 22.5 lb can't be typed. | UIR-3, FT-10, BH-4, EC-12, EC-5 | Confirmed (4 testers) | Real | `KeyboardDoneBar` is mounted once at the root. Under the New Architecture an `InputAccessoryView` only attaches to inputs it finds when it mounts, so sheets and later inputs never get it. Render it next to the inputs (in `NumberField` and each screen). Use a `decimal-pad` for weight. Scroll the focused field into view. |
| VQA-008 | **Back labels are wrong:** Settings "‹ Profile" goes to the room. Lift progress from Today says "‹ Profile". | FT-8, UIR-7, BH-13 | Confirmed | Real | Lift progress: the `from: 'Today'` flag is on Profile's link (App.tsx ~2745) instead of Today's (~3129). Swap them. Settings: label it with the screen it actually returns to. |
| VQA-009 | **No sanity limits on lifts or runs.** 1102 lb × 8 sets a permanent "Grand Champion / 99th · Elite" PR. 100 mi in 1 min gives "0:01 /mi" and +40 XP. 99999 lb × 9999 is accepted. A typo is then prefilled next session. | EC-3 | Confirmed | Real | Clamp at plausible maxima and confirm above them. Exclude out-of-range sets from PRs and ranks. |
| VQA-010 | **The step goal field snaps to 1000 when cleared,** so editing garbles it (typing 100000 gave 1,010,000,000). A goal of 1 is accepted. | BH-7, EC-4 | Confirmed (3/3) | Real | Keep the raw text while editing and validate on blur, with limits of 1,000–100,000. |
| VQA-011 | **Onboarding accepts a goal weight in the wrong direction** (300 lb for a 160 lb user who chose "Lose fat"), then silently relabels the goal "Build muscle". | BH-1, BH-12 | Confirmed once | Real | Validate the direction against the chosen goal and ask, rather than overriding. |
| VQA-012 | **Plate stepper:** "−" at 0.5× removes the item, the list shifts under the finger, and the next tap selected a different food. | BH-5 | Suspected (once) | Real | Stop at 0.5×, or show a separate remove ×. |
| VQA-013 | **A 0-kcal food** makes Today say "analysis incomplete", is graded D, and gives the pet a JUNK effect. | EC-6 | Confirmed | Real | Treat 0 kcal as a valid value (water, black coffee). Grade drinks neutrally. |
| VQA-014 | **Theme flips between screens.** At night, Today and the Mind sheet are dark while the screens they open (Food trends, Lift progress, word puzzle) are light. This contradicts the Appearance copy. | FT-11, UIR-4 | Confirmed | Real (by design, inconsistent) | Either make Today's children follow Today's light, or have Today follow the theme and keep night styling inside the rooms. Then fix the Appearance copy. |
| VQA-015 | **Mind sheet's "Mind today" card** is about 355 pt tall, with the pet stretched into a narrow strip and lowercase text. | FT-12, UIR-5 | Confirmed (3/3) | Real | Size it to its content with a square pet tile, or show real stats. (On web it looked the same before this session's restyle.) |
| VQA-016 | **Text is cut off at the largest text sizes:** Today's ring shows "1,9…", paywall subtitles (some at default size), Settings Plus row, "Rest · Bench Pr…", and the meal × pushed into the sheet corner. | UIR-6 | Confirmed | Real | Let text wrap. Fit the ring number to the ring (the ring fitter caps at 22 pt but doesn't account for large text sizes). Keep × inside the safe area. |
| VQA-017 | **Many touch targets are under 44 pt:** sheet × 30, set ✓ 30, remove-set 28, water −/+ 34, text links 14–24 tall, Stats Share 64×16, menu rows ~38, rest buttons ~36. | UIR-10 | Confirmed (measured) | Real | Use `hitSlop` to reach 44 where the visual stays small. |
| VQA-018 | **Food trends, 30 days:** axis labels show "1..", and the selection jumps to the same bar index after switching range. Small bars are nearly invisible in dark mode. | UIR-8 | Suspected (once) | Real | The 30-day labels are wider than one bar column. Draw them as absolute labels every 7 days. Reset the selection on range change. Raise the minimum bar height and contrast. |
| VQA-019 | **Plus paywall:** the × (32 pt) scrolls under the status bar onto the clock; a tap missed. | UIR-9 | Suspected (once) | Real | Pin the close button outside the scroll view. |
| VQA-020 | **Onboarding is 20 steps.** Two filler screens are Next-only, all body stats are required, and only "Your name" can be skipped. | FT-1 | Confirmed | Real (UX) | Merge the filler screens. Allow "Skip for now" on body stats. |
| VQA-021 | **Offline, the living room (the first screen) has no action, and chat and Friends are hidden with no hint.** The whole room's accessibility label "Say hi to Miso" does nothing. | FT-6, FT-7, UIR-22 | Confirmed | Partly sim (local mode) | Show a disabled chat entry with "Sign in to chat". Give the living room an action. Fix the accessibility label. |
| VQA-022 | **Jargon and inconsistent names:** care log vs care moments, eyebrow styles, FRESH, Grade, Vitality, Hunger direction, "27th · Novice", "6% of today's fuel", the "Hello, world" achievement, two stacked achievement modals, and "Strength session" as the name for a run. | FT-13, FT-14, UIR-20 | Confirmed | Real (copy) | Pick one verb (Log). Add short explanations for Grade, FRESH and Hunger. Rename the "Hello, world" achievement. Merge the stacked modals. |

### Low

| ID | Issue | Sources | Status | Cause |
|---|---|---|---|---|
| VQA-023 | Goal-date chips: the 4th month is fully off-screen with no peek; no "No deadline" option | FT-2 | Confirmed | Real |
| VQA-024 | With the number pad open, the first chip tap only closes the keyboard | FT-3 | Suspected | Real |
| VQA-025 | Multi-select cards show selection by tint only, with no "pick several" hint | FT-4 | Suspected | Real (UX) |
| VQA-026 | "That weight doesn't look right" error stays after the value is fixed; Next disabled without a hint | BH-3, BH-4 | Confirmed | Real |
| VQA-027 | "You're at X lb now" once showed a different weight from the one typed | BH-2 | Suspected | Unclear |
| VQA-028 | Plate row shows scaled kcal next to "per 100 g" | BH-6 | Confirmed | Real |
| VQA-029 | Macro rounding inconsistent (fat 0 g vs 0.66; fiber 6 vs 5.2) | BH-8 | Confirmed | Real |
| VQA-030 | Water rounding: 1 cup = 8.5 fl oz but totals read 8; 25.5 shown as 25 | BH-9, UIR-13 | Confirmed | Real |
| VQA-031 | Workout duration estimated from set count, not measured | BH-16 | Confirmed | Real (design) |
| VQA-032 | A run logged from Outdoors counts as Gym; the Outdoors tally stays 0 | EC-7 | Confirmed | Real |
| VQA-033 | An emoji-first name shows a broken "?" avatar initial | EC-8 | Confirmed | Real |
| VQA-034 | 5-digit weights clip in the field; big numbers lack thousands separators | EC-9 | Confirmed | Real |
| VQA-035 | Display name silently cut at 40 characters; Save changes gives no feedback | EC-10 | Confirmed | Real |
| VQA-036 | Water-goal XP kept after removing all water (can't be farmed) | EC-11 | Confirmed | Real (minor) |
| VQA-037 | Word puzzle opened from Today returns to the room after logging; closing returns to Today, not Mind | EC-13, UIR-23 | Confirmed | Real |
| VQA-038 | Word puzzle with one guess made shows "not played yet" on Stats and Today | UIR-14 | Suspected | Real |
| VQA-039 | Exercise search "run" ranks Crunches above Running | FT-15 | Confirmed | Real |
| VQA-040 | Food search shows raw USDA names, per 100 g only | FT-16 | Confirmed | Real |
| VQA-041 | Locked animals' labels about 1.5–2:1 contrast | UIR-11 | Confirmed | Real |
| VQA-042 | Outdoors room status bar unreadable over the tree art and under the sheet | UIR-12 | Suspected | Real |
| VQA-043 | Back and close buttons, and header title sizes, differ from screen to screen | UIR-15 | Confirmed | Real |
| VQA-044 | Personal Records tiles misalign when a lift name wraps | UIR-16 | Confirmed | Real |
| VQA-045 | Visible label ≠ accessibility label ("Pick exercises" read as "Add exercise"), which breaks Voice Control | UIR-17 | Confirmed (also broke the first regression run) | Real |
| VQA-046 | Search results 1 pt under the field; Recent rows inset 6 pt more than their label | UIR-18 | Confirmed | Real |
| VQA-047 | The first Profile tap in the account menu didn't navigate; onboarding possibly still in the accessibility tree after finishing | FT-9, FT-17 | Suspected | Possibly a testing artifact |

### Not app bugs
- **BH-15 "10.5 reps → 105":** the reps field is a number pad with no decimal key, so a real user can't type "10.5". Maestro's "." was dropped. The real issue is the weight-pad part of VQA-007.
- **BH-10, Maestro reading the wrong simulator:** a tool problem when two testers run at once. Corrected by running them one at a time.
- **"[expo-notifications] … KEYCHAIN_ACCESS" toast on launch:** simulator only. The GO_BACK *toast* is dev-only too, but VQA-001 behind it is real.
- **AsyncStorage "No space left on device"** in metro.log: the Mac's disk filled during testing. It's not an app bug, but the app gives no message when a save fails for lack of space (worth handling).

## UI/UX review (summary)

The UI reviewer's full findings, with a polish score per screen, are in `qa-artifacts/ui-review/findings.md`.

- **Strong:**
  - The pixel rooms (8.5/10), Settings list (8.5), word puzzle (8), and dark mode overall (8).
  - The new rest timer and Last column read clearly. Ticked rows turning green is good feedback.
  - Word puzzle tiles use colour plus a symbol, which helps colour-blind players.
- **Weak:**
  - Scan barcode (3/10, VQA-006), the Mind sheet (5, VQA-015), Food trends (5.5, VQA-018).
  - Large text sizes overall (6, VQA-016), the paywall (6).
- **Consistency themes:**
  - Five different "go to more" styles (›, ▸, →, ↗, and a › that opens an alert).
  - Outlined vs filled cards.
  - Grouped vs bare toggle lists in Settings sub-pages.
  - Segmented controls at two heights.
  - Underline tabs vs segmented control.
  - Coral vs green selection ticks.
  - Four different eyebrow-label conventions.
  - Plus-locked features open four different ways.
  - A shared header component (back, title, close) would fix VQA-008 and VQA-043 and most of the inconsistency.
- **Pixel/Apple seams:** a smooth "+ Log" pill sits over pixel rooms, and plain Apple cards float over the pixel study in the Mind sheet. Consider one bridge style for controls drawn on pixel scenes.
- **Not judged:** animation curves and spring feel (every capture was already settled), haptics (simulator). These need a session on a phone.

## Regression checklist

Maestro flows in `qa/maestro/`, run on iPhone 17 Pro (5062CC77). Results are in `qa-artifacts/regression/*.xml` (JUnit) and `*.log`.

| Flow | Covers | Result |
|---|---|---|
| `onboarding.yaml` | Clean install → full onboarding → pet room (`clearState`, run last) | ✅ Pass (2m 58s) |
| `open-today.yaml` | Today → Food trends → back → Lift progress → back → room | ✅ Pass (30s) |
| `open-preferences.yaml` | Account menu → Settings → Your preferences → back | ✅ Pass (26s) |
| `log-meal-recent.yaml` | Kitchen → Log meal → Recent item → Add → shows under Today's "Logged today" | ✅ Pass (42s) |
| `log-workout.yaml` | Gym → Log workout → Bench Press → tick set → rest timer +15/−15/Skip → Finish → back on the room | ✅ Pass (50s) |

- **First run:** 0/5. Every failure was the flow's selector, not the app: visible text ≠ accessibility label (VQA-045), case-insensitive matching tapping the otter tile instead of the button, a back link's text, and an uppercase heading.
- **Run them:**
  ```
  maestro --device <UDID> test qa/maestro/<flow>.yaml
  ```
  Run all five, with onboarding last because it wipes the app's data.
- **Not automated yet:** water +/−, word puzzle, kill-and-relaunch persistence, validation errors, the rest timer reaching zero.
- **Unit tests:** the project's jest (688) and vitest (1,009) suites pass.

## Recommended fix order

1. **VQA-001** (double close): one line, and it can pop the wrong screen.
2. **VQA-007** (Done bar and number pads): introduced today, and you reported it on device; small.
3. **VQA-002** (meal XP cap): an economy exploit, made faster by the new Recent list.
4. **VQA-003 + VQA-004** (workout drafts and discard confirmation): one change fixes both. Highest user-pain item for gym users.
5. **VQA-005, VQA-009, VQA-010, VQA-011** (input validation): one pass across Preferences, workout sets and runs, the step goal, and onboarding's goal weight.
6. **VQA-006** (barcode permission layout): small, highly visible to free users.
7. **VQA-008** (back labels): Lift progress is a one-line swap.
8. **VQA-013** (0-kcal drinks graded as junk) and **VQA-012** (plate stepper).
9. **VQA-015, VQA-016, VQA-017, VQA-018** (Mind card, large text, touch targets, 30-day chart).
10. **VQA-014** (theme rule), **VQA-020–022** (onboarding length, the offline living room, copy): product decisions first, then small changes.

The Low items can go in a polish sweep after that.

## Coverage gaps
- **Needs the real backend and a test account:** sign-up, sign-in, password reset, sign-out, cloud sync and conflict handling, Friends and shared pets, pet chat replies, AI photo grading, AI meal fixes, push notifications, account deletion, session expiry.
- **Needs a physical phone:** Apple Health import and step sync, camera and photo pick, barcode scanning, haptics, spring and gesture feel, the Live Activity rest timer and pet in the Island, the Home Screen widget, notifications when locked.
- **Not reached in the time:**
  - most Settings sub-pages (beyond Preferences, Appearance, What affects Miso, Notifications, Animals & forms, Personality, Voice, Credits)
  - Step trends (Steps was switched off on the reviewing simulator)
  - Mind games other than the word puzzle, starting and deleting routines
  - true network-off behaviour
  - sub-100 ms double taps
  - clock and timezone changes
  - small-screen devices (no iPhone SE runtime installed)
  - VoiceOver navigation beyond labels in the accessibility tree
- **Never done:** purchases and Restore.

## Ten most important findings
1. **VQA-001:** Finishing a workout navigates back twice. That's a dev error now, and could pop the wrong screen.
2. **VQA-003:** Killing the app mid-workout loses the whole session.
3. **VQA-002:** Unlimited +10 XP per meal, so levels and coins can be farmed.
4. **VQA-007:** No Done key on any number pad, which covers Finish and Notes. Decimal weights are impossible.
5. **VQA-005:** Age 999 or weight 0 saves and silently rewrites calorie targets.
6. **VQA-004:** × on a logging sheet throws away work without asking.
7. **VQA-006:** Broken "Allow camera" layout on the barcode tab.
8. **VQA-009:** Absurd lifts and runs become permanent PRs, ranks and XP.
9. **VQA-010:** The step goal field garbles numbers while editing.
10. **VQA-014 / 015 / 016:** Day/night theme flips between screens, the broken-looking Mind card, and cut-off numbers at large text.

**Fix before release:** items 1–7 at minimum, plus VQA-008's one-line swap. After those, re-run the five regression flows and do a short session on a phone for the things the simulator can't test: haptics, Done bar, Live Activity, widget.
