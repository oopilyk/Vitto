# Bug-hunter findings (functional QA) — simulator iPhone 17 DB1C1466-DB7F-4CFD-BC53-C40896D3862A

Running file, written as testing proceeds. Screenshots: /Users/kli/dev/vitto/qa-artifacts/screenshots/bug-hunter/

### BH-1: Onboarding accepts a goal weight in the opposite direction of the chosen goal
- Type: Bug
- Severity: Medium
- Screen: Onboarding step 11 "What would you most like to do?" -> step 12 "What weight are you aiming for?"
- Steps to reproduce: 1. Enter 160 lb on the body step. 2. Pick "Lose fat & build muscle". 3. Enter goal weight 300 lb, pick "Jan 2027", tap Next.
- Expected: A goal heavier than the current weight is rejected or flagged for a fat-loss goal (and a 140 lb gain in about 2 months is flagged as unrealistic).
- Actual: Accepted without comment; onboarding moves on to step 13. The only check is the absolute range "Pick a goal between 66 and 660 lb."
- Evidence: screenshots/bug-hunter/18-goal300b.png (300 entered), 15-goal5-next.png (range message for 5 lb)
- Reproduced: once
- Suggested fix: In OnboardingScreen validate() for stepId 'target', compare goalNumber against displayedWeight according to the goal direction, and cap the weekly rate.

### BH-2: "You're at X lb now" showed a weight different from the one typed (once)
- Type: Bug
- Severity: Medium
- Screen: Onboarding step 10 (height/weight) -> step 12 (goal weight)
- Steps to reproduce: 1. On the body step, type an invalid weight (0, then 99999) and tap Next (you get "That weight doesn't look right."). 2. Correct it to 160 and tap Next. 3. Pick a goal.
- Expected: Step 12 says "You're at 160 lb now."
- Actual: It said "You're at 140 lb now." even though the field showed 160. After Back, Back and forward again it showed 160 correctly.
- Evidence: screenshots/bug-hunter/10-weight160.png (field = 160), 11-goal-weight-140.png (hierarchy text "You're at 140 lb now."), 12-back-to-body.png
- Reproduced: once (the second pass showed 160)
- Notes: updateBody only writes weightKg when the text is not empty (`if (next.weight) onUpdate('weightKg', ...)`), so clearing the field leaves the last intermediate value in the profile. That may be how the profile and the field get out of sync.

### BH-3: The "That weight doesn't look right." error stays on screen after the value is fixed
- Type: UX issue
- Severity: Low
- Screen: Onboarding step 10
- Steps to reproduce: 1. Enter 0, tap Next (error appears). 2. Type 160.
- Expected: The error clears once the input changes.
- Actual: The error stays until Next is tapped again.
- Evidence: screenshots/bug-hunter/10-weight160.png
- Reproduced: yes (2/2)
- Suggested fix: setStepError(null) in updateBody / the goal input's onChangeText.

### BH-4: Number-pad fields have no Done key, and Next on the goal step is disabled with no hint
- Type: UX issue
- Severity: Low
- Screen: Onboarding steps 10 and 12
- Actual: The number-pad keyboard can't be dismissed (maestro hideKeyboard also fails). On step 12, Next stays disabled after a goal weight is typed until a "By when?" month is picked, and nothing says that a month is required.
- Evidence: screenshots/bug-hunter/13-goal.png
- Reproduced: yes
- Suggested fix: Add an input accessory with Done; show helper text "Pick a month" or default to a month.

### BH-5: Tapping "−" on a 0.5× plate item removes it, the list shifts, and the next tap selects a different food
- Type: UX issue
- Severity: Medium
- Screen: Log meal sheet > Search > "Your plate"
- Steps to reproduce: 1. Search "banana", select "Bananas, raw" (plate shows 1×). 2. Tap "−" 4 times quickly in the same spot.
- Expected: The serving stops at its minimum, or removing needs a separate, clearly different control. The list should not move under the finger.
- Actual: 1× → 0.5×, then the "−" button turns into "×" and the next tap removes the item. The "Your plate" card collapses and the results list moves up, so the 4th tap selected "Bananas, dehydrated, or banana powder" (346 kcal/100 g) instead. The plate then showed the wrong food at 0.5×.
- Evidence: screenshots/bug-hunter/31-banana-selected2.png (1× raw), 32-servings-min.png (wrong food on the plate, 0.5×, − shown as ×)
- Reproduced: once
- Suggested fix: Keep "−" disabled at the minimum serving and use a separate remove/trash control, or keep the plate card's height when it is empty.

### BH-6: The plate row shows the scaled kcal next to "per 100 g"
- Type: Bug
- Severity: Low
- Screen: Log meal sheet > "Your plate"
- Steps to reproduce: Select "Bananas, dehydrated…" (346 kcal per 100 g) and step to 3.5×.
- Expected: "1211 kcal · 350 g", or "346 kcal per 100 g × 3.5".
- Actual: "1211 kcal · per 100 g" (and "178 kcal · per 100 g" for 2× raw banana). The label is wrong: 1211 kcal is not per 100 g.
- Evidence: screenshots/bug-hunter/33-servings-up.png, 35-banana-2x.png
- Reproduced: yes (2/2)

### BH-7: The Today step goal can't be cleared or set to 0: an empty field or 0 silently snaps to 1000
- Type: Bug
- Severity: Medium
- Screen: Today > Outdoors > Daily goal
- Steps to reproduce: 1. Today, scroll to OUTDOORS. 2. Tap the Daily goal field (10000), erase, type 0, tap outside.
- Expected: Either reject 0 with a message, or keep what was typed until editing ends, then validate.
- Actual: The goal became 1000 ("0 / 1,000 steps") with no message. The input is controlled with `onStepGoalChange(Number(value.replace(/[^0-9]/g, '')) || 1000)` (TodayScreen.tsx ~line 535), so each change that empties the field writes 1000 into the profile immediately, and there is no upper bound. Also, the number-pad keyboard covers the field while editing (the screen doesn't scroll it into view) and no Done bar was visible even though inputAccessoryViewID is set.
- Evidence: screenshots/bug-hunter/42-stepgoal-0.png (keyboard hides the field), 43-stepgoal-blur.png (goal became 1,000), 44-stepgoal-8000.png (8000 accepted)
- Reproduced: once for 0 → 1000; a valid 8000 worked
- Suggested fix: Keep a local draft string, validate on blur/Done (for example 1,000–100,000) with an inline message, and use KeyboardAvoidingView/scrollToInput.

### BH-8: Fat shows 0 g and fiber 6 g for 2 raw bananas (0.66 g fat, 5.2 g fiber): inconsistent rounding
- Type: Bug
- Severity: Low
- Screen: Today > Food card macros
- Steps to reproduce: Log "Bananas, raw" at 2× (178 kcal) via search, open Today.
- Expected: Using USDA per-100 g values (fat 0.33, fiber 2.6), 2× is fat 0.7 g → 1, fiber 5.2 g → 5.
- Actual: Fat "0 / 92g", fiber "6 / 41g" (protein 2, carbs 46, sugar 24 g, sodium 2 mg match).
- Evidence: screenshots/bug-hunter/38-today.png
- Reproduced: once. The source data may differ from USDA reference values, so the rounding rule should be confirmed.

### BH-9: Water total rounds 25.5 fl oz down to "25 fl oz"
- Type: Bug
- Severity: Low
- Screen: Today > Water
- Steps: Tap + three times (1 cup = 8.5 fl oz).
- Actual: "25 fl oz / 68 fl oz" (25.5 → 25); 2 cups = 17 correct. Minus works.
- Evidence: screenshots/bug-hunter/40-water-3.png, 41-water-minus1.png
- Reproduced: once

### BH-10 (environment, blocks reliable testing): Maestro hierarchy/text taps sometimes hit the OTHER tester's simulator
- Type: Blocked
- Severity: High (for the QA process, not the app)
- Actual: With two simulators driven at once, `maestro --device DB1C1466… hierarchy` several times returned the other simulator's screens: a meal sheet while mine was on onboarding, a gym room plus a LogBox "The action 'GO_BACK' was not handled by any navigator" (WorkoutScreen.saveRoutine → App.tsx:3209 onClose → navigation.goBack()), and a Settings > Units page. Text-selector taps resolved against those hierarchies, so some of my text-based taps (e.g. "Bananas, raw" at 7:18 PM, "Weightlifting" at 7:04 PM) may have landed on the other simulator. My own simctl screenshots never showed those screens. From 7:18 PM on I used only coordinate taps checked against simctl screenshots.
- Evidence: screenshots/bug-hunter/20-goback-error.png is a simctl screenshot of MY device taken at that moment (it shows my onboarding, not the LogBox), which proves the hierarchy came from elsewhere.
- Note for the other tester: the GO_BACK console error after saving a routine looks real, but it was seen on their device, not reproduced by me.

### BH-11: Preferences accepts Age 999 and Weight 0 with no validation; age 999 drops the calorie target from 2,962 to 1,200 kcal
- Type: Bug
- Severity: High
- Screen: Settings > Your preferences
- Steps to reproduce: 1. Settings > Your preferences. 2. Set Age to 999 (and/or Weight (lb) to 0). 3. Tap Save changes. 4. Open Today.
- Expected: Range checks matching onboarding (weight 30–300 kg, a sane age), with an inline message next to the field.
- Actual: No message at all. Age 999 was saved: Settings shows "Kyle 🦦 · 999 · Build muscle", and Today's target changed from "2,962 kcal · 131g protein · 403g carbs · 92g fat · 41g fiber" to "1,200 kcal · 131g protein · 86g carbs · 37g fat · 17g fiber". The only validation in PreferencesScreen.save() is calorieGoalProblem. The age/weight/height fields use `Number(digits(value)) || 0`, so an empty field becomes 0.
- Also: after the first Save tap (age 999 + weight 0) the save bar stayed visible with no spinner or error, and Settings still showed "29". On the second attempt the value landed. I couldn't tell whether the first save failed, was slow, or was rejected, and the user can't either.
- Evidence: screenshots/bug-hunter/85-prefs-invalid.png, 86-prefs-save-invalid.png, 88-settings-after-invalid.png (still 29), 90-age999-saved.png, 92-name-emoji-save.png, 93-settings-999.png, 97-today-after-recent.png (target 1,200)
- Reproduced: age 999 saved (1 of 2 attempts); weight 0 not confirmed saved
- Suggested fix: Reuse the onboarding range checks in save(), show the problem in SaveBar's error slot, and give the Save button a visible saving state.

### BH-12: The goal label comes from the target weight and overrides the goal the user picked
- Type: Bug
- Severity: Medium (follows from BH-1)
- Screen: Onboarding step 11/12 → Settings
- Actual: I picked "Lose fat & build muscle" with a 300 lb target (current 160). Settings shows the goal as "Build muscle" and the starter plan says "Reach 300 lb by January 2027". setGoalWeight() runs `onUpdate('goal', deriveEnergyGoal(profile.weightKg, kg))`, which silently replaces the choice from step 11.
- Evidence: screenshots/bug-hunter/22-starter-plan-300lb.png, 82-settings.png
- Reproduced: once

### BH-13: Back buttons say "‹ Profile" but go somewhere else
- Type: UX issue
- Severity: Low
- Screens: Lift progress (opened from Today) shows "‹ Profile" and returns to Today. Settings (opened from the account menu on the pet room) shows "‹ Profile" and returns to the pet room.
- Evidence: screenshots/bug-hunter/48-lift-progress.png → 75-lift-back.png; 82-settings.png → 94-after-settings-back.png
- Reproduced: yes (2 screens)
- Suggested fix: Use the actual previous route's title as the back label.

### BH-14: Console error "The action 'GO_BACK' was not handled by any navigator" when finishing a workout
- Type: Bug
- Severity: Medium
- Screen: Log workout > Finish workout (after "Save as routine" → "Save routine")
- Steps to reproduce: 1. Gym > Log workout > Pick exercises > Bench Press > Done. 2. Enter 135.5 × 8, tick the set, add a set. 3. "Save as routine" > "Save routine". 4. Finish workout.
- Expected: The sheet closes without errors.
- Actual: The workout is saved and the sheet closes (Today shows "Push day QA · 6 min · 1 exercise", +12 XP, Lift progress estimates 172 lb), but a red LogBox toast appears: "The action 'GO_BACK' was not handled by any navigator". The other tester's device showed the full stack: WorkoutScreen.props.onClose (App.tsx:3209) ← saveRoutine (WorkoutScreen.tsx:273). App.tsx's onFinish already calls navigation.goBack(), and a second goBack (onClose) fires after the screen is gone, so two code paths both pop the Workout route.
- Evidence: screenshots/bug-hunter/70-finish.png (toast on my device), 20-goback-error.png note in BH-10; 73-today-gymcard.png, 74-lift-progress-after.png
- Reproduced: yes (seen on both simulators, independently)
- Suggested fix: Guard with navigation.canGoBack(), or make sure only one of onFinish/onClose pops the route.

### BH-15: Decimal reps are silently turned into a different number (10.5 → 105)
- Type: Bug
- Severity: Medium
- Screen: Log workout > set row > REPS
- Steps to reproduce: Type "10.5" in REPS.
- Expected: Reject the decimal or round it to 10/11.
- Actual: The field shows "105" and the summary says "1 set · 105 reps · 14227.5 lb volume". The dot is stripped and the digits joined. LB accepts 135.5 correctly.
- Evidence: screenshots/bug-hunter/57-set-decimal.png
- Reproduced: once
- Suggested fix: Number pad without a decimal key for reps, or parse and round instead of stripping characters.

### BH-16: Workout duration is estimated from set count, not measured
- Type: Design recommendation (subjective)
- Severity: Low
- Actual: The summary shows "3 min" per set (1 set = 3 min, 2 sets = 6 min) no matter how long the session took. I spent about 6 minutes on 1 set.
- Evidence: screenshots/bug-hunter/56-workout-bench.png, 62-addset.png, 73-today-gymcard.png

## Things that worked (verified)
- Pet name: whitespace-only name keeps Next disabled; 60-char name accepted (the header truncates it); "  Miso  " is trimmed to "Miso". User name step reachable; Skip offered.
- Onboarding weight: 0 and 99999 rejected with "That weight doesn't look right."; letters keep Next disabled. Goal weight 5 lb rejected with "Pick a goal between 66 and 660 lb."
- Meal by search: "banana" returned USDA results in local mode (no network failure seen). Steppers 0.5×–3.5× work. 2× Bananas raw logged as 178 kcal / 2 g protein / 46 g carbs, and Today shows exactly 178 kcal consumed, "1 meal", +10 XP.
- Meal via Recent: "Bananas, raw · 200 g · 178 kcal · Grade B" re-added at 1×. Today went to 356 kcal, 2 meals, protein 4, carbs 92 (exactly double). Food trends shows Plate grade B = 1.
- Water: + / − work (2 cups = 17 fl oz; but see BH-9). It shows in "Today's activity".
- Workout: exercise search with no match shows "Nothing matched that search."; Bench Press added; LB decimals OK; ✓ starts "Rest · Bench Press" timer; −15 (×2) took 1:16 → 0:27 (about −30 s plus elapsed time); +15 works; Skip hides the timer; + Add set copies the previous set; "Save as routine" → routine editor → "Save routine" shows "Saved "Push day QA" — one tap next time." and the LAST column shows "135.5 × 8"; Finish workout logs it (Today: GYM ✓ Push day QA, +12 XP; Lift progress: est. max 172 lb, Gold, consistent with Epley 135.5×(1+8/30)=171.6).
- Word puzzle: ENTER with 1 letter → "Needs 5 letters."; CRANE scored (A, N present); ZZZZZ → "That one isn't in the word list." and does not use up a guess (5 of 6 left).
- Food trends 7/30-day toggle; Lift progress empty state before any lift; "See Plus" upsell shown (not tapped).
- Emoji in the preferences Name ("Kyle 🦦") saved and shown in the Settings summary.

## Coverage

| Screen / flow | Controls tested | Result |
|---|---|---|
| Onboarding 1–19 (welcome, companion, meet, pet name, your name, care areas, about you, age, sex, height/weight, goal, goal weight + date, activity, training days, training type, steps, starter plan, Apple Health, streak goal, reminder) | Get started; companion grid (Otter); name field (empty/spaces/60 chars/trimmed); Next/Back; care-area toggles x4; age, sex, ft/in chips; weight (0, -5, 99999, 160.5, abc, 160); goal options; goal weight (0, 99999, 5, 300) and month chips; activity; 4 days; Weightlifting; 10,000 steps; Let's do it; Maybe later (Apple Health); 7 days; Start today | Pass with issues BH-1..BH-4, BH-12 |
| First-run tour | Show me around, Next x7, Let's go | Pass |
| Pet room (living room/kitchen/gym) | Room switcher (gym, kitchen, living room), Log meal, Log workout, TODAY ring, account menu | Pass |
| Meal sheet (Search tab) | Search field, Find (empty and "banana"), result select/deselect, − / + servings, remove, Add to care log, Recent +, achievement dismiss | Pass with BH-5, BH-6 |
| Meal sheet Photo · Plus / Scan barcode | Not tapped | Not tested (Plus paywall / camera unavailable in simulator) |
| Today | Back "Pet", water − / +, step goal field (0, 8000), Food Trends & averages, Lift progress, Today's word puzzle link, Today's activity | Pass with BH-7, BH-8, BH-9, BH-13 |
| Food trends | 7 days / 30 days, back | Pass |
| Step trends ("Trends & averages" on the Outdoors card) | Not opened | Not tested (time) |
| Lift progress | Opened before and after a workout, back | Pass with BH-13 |
| Workout sheet | Pick exercises, exercise search (no match), add Bench Press, Done, LB/REPS (decimals), ✓ set, rest −15/+15/Skip, + Add set, Name field (spaces trimmed to "Push day QA"), Save as routine, Save routine, Finish workout | Pass with BH-14, BH-15, BH-16 |
| Routine start-from-list / delete routine | Not exercised | Not tested (time) |
| Word puzzle | Start, letter keys, ENTER (short/invalid/valid), close × | Pass |
| Account menu | PROFILE, SETTINGS | SETTINGS pass; PROFILE not opened |
| Settings (root) | Your preferences, back | Pass with BH-13 |
| Your preferences | Name (emoji), Age (999), Weight (0), Save changes, Discard | Fail: BH-11 |
| Settings sub-pages: Animals & forms, What affects Miso, Personality (Plus), Notifications, Appearance, Music toggle, Pet voice (Plus), Units, Apple Health, account | Not opened | Not tested (time; also the hierarchy cross-talk, BH-10, made text-selector driving unreliable) |
| Profile, Friends, pet chat, mind games hub ("Train the mind"), Outdoors room, Study room | Not opened | Not tested (time) |
| Sign up / sign in | — | Blocked: out of scope per brief (local mode) |
| Apple Health connect/sync, push, camera, barcode | — | Untestable in simulator per brief |
| Plus paywall purchase | — | Not tapped, per brief |

## JS errors / LogBox seen on my device
- On launch: the known expo-notifications KEYCHAIN_ACCESS toast (dev noise, per brief).
- 7:35 PM, Finish workout: "The action 'GO_BACK' was not handled by any navigator" (BH-14). Metro log lines added during my actions contained no other new ERROR/WARN entries (only " INFO  Launching DevTools...").
- metro.log lines 24–25 (before my session): `Uncaught (in promise) … Failed to create storage directory … "RCTAsyncLocalStorage_V1" because there isn't enough space`. The host data volume is at 98% (13 GiB free). That may matter for BH-11's flaky first save, though I didn't prove a link.

## Maestro flows (drafts in /Users/kli/dev/vitto/qa/maestro/)
Built from labels seen in `maestro hierarchy`. None has passed end to end yet:
- open-preferences.yaml: run once; "Open account menu" passed, then "SETTINGS" did not match (the menu item is probably the text "Settings" uppercased by style). Changed to "(?i)settings", not re-run.
- onboarding.yaml, open-today.yaml, log-meal-recent.yaml, log-workout.yaml: written from the exact labels/coordinates I used by hand, not run as flows. Two rows (Recent "+", set ✓) have no accessible label, so the flows use percentage coordinates there (fragile; adding testIDs would fix it).
