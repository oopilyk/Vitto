# Edge-case / stress QA findings (agent: EC)

Simulator: iPhone 17, iOS 26.5, UDID DB1C1466-DB7F-4CFD-BC53-C40896D3862A, local mode, Debug build via Metro 8082.
Session: 2026-11-06 20:27 to 21:36. Screenshots: /Users/kli/dev/vitto/qa-artifacts/screenshots/edge-cases/
Baseline on Today at 20:28: +32 XP, Level 1 32/100, Food 2 meals / 356 kcal, water 17 fl oz, Gym "Push day QA" done, Mind none.
Rapid taps were made with Maestro `tapOn: {repeat: N, delay: 20-40 ms}`. Maestro's real interval between taps is longer than the delay value (it is not measured; likely about 100-300 ms), so "no duplicate" below means no duplicate at that cadence, not at true sub-50 ms double-taps.

Counts: High 2 · Medium 4 · Low 8 · Blocked 1

### EC-1: Logging 0-kcal foods (tap water) grants +10 XP each with no cap; can farm levels and coins
- Type: Bug
- Severity: High
- Screen: Kitchen > Log meal > Search; Today
- Steps to reproduce: 1. Log meal > Search "water tap" > "Beverages, water, tap, drinking" (0 kcal) > Add to care log. 2. Repeat via Recent ("Log Beverages, water... again") > Add to care log, 6 more times. 3. Open Today.
- Expected: A 0-kcal drink is not a meal, or gives no/limited XP; food XP has a daily cap.
- Actual: Each log adds +10 XP. Food XP went +35 -> +45 (1st) -> +65 (3rd) -> +105 (7th); Today "10 meals logged". It pushed Miso to Level 2 ("LEVEL UP!" modal) and +50 coins (Stats: "50 coins · 50 for every level-up"). Each takes about 3 taps.
- Evidence: 29-zero-cal-plate.png, 30-zero-cal-incomplete.png, 32-level-up.png, 33-today-food-log.png
- Reproduced: yes (7/7 logs each gave +10)
- Suggested fix: Skip or reduce XP for meals under a minimum kcal, or dedupe identical items within a short window, and cap food XP per day.

### EC-2: In-progress workout (sets, ticks, rest timer) is lost when the app is killed
- Type: Bug
- Severity: High
- Screen: Gym > Log workout
- Steps to reproduce: 1. Start routine "Push day QA", add sets until 50, enter values, tick sets 49 and 50 (rest timer "1:12 of rest left"). 2. `simctl terminate` then relaunch (20:47:38). 3. Gym > Log workout.
- Expected: The draft workout and running rest timer come back (iOS often kills a backgrounded app during a long gym session).
- Actual: The sheet is back at "Log a workout / What are you training today?"; all 50 sets, ticks and the timer are gone with no warning. Backgrounding for 30 s without a kill is fine: the timer kept wall-clock time (1:07 at 20:46:05 -> 0:20 at about 20:46:50) and all sets were kept.
- Evidence: 12-rest-timer.png, 13-relaunch-mid-workout.png, 14-workout-after-relaunch.png
- Reproduced: once (also seen for the meal plate and word puzzle, see EC-14)
- Suggested fix: Persist the workout draft (and rest-timer end timestamp) to storage on each change, and offer "Resume workout" on launch.

### EC-3: No sanity limits on lift weight or run pace; absurd values set permanent PRs, ranks and XP, and are prefilled next time
- Type: Bug
- Severity: Medium
- Screen: Workout sheet, Lift progress, Profile > Personal records, Outdoors > Log a run
- Steps to reproduce: 1. Bench set 1: 1102 lb (about 500 kg) x 8, tick, Finish. 2. Outdoors > Log a run > Running: 1 min, 100 mi, Finish. 3. Open Lift progress and Profile. 4. Start the routine again.
- Expected: Implausible values (1102 lb x 8 bench, 100 mi in 1 min = 0.6 s/mile) are rejected or need confirmation; PRs can be corrected.
- Actual: Lift progress "1396 lb · Grand Champion · +1224 lb since Nov 6"; Profile "1102 lb x 8 · 99th · Elite", "Strongest: Chest · Grand Champion"; FASTEST MILE "0:01 /mi", LONGEST RUN "100 mi"; the 1-min run gave +40 Gym XP (+24 -> +64). Next time the routine loads, set 1 is prefilled with 1102 and LAST shows "1102 x 8", so one typo carries on. A weight of 99999 lb and 9999 reps was accepted (summary "50 sets · 489952 reps · 48994611151 lb volume").
- Evidence: 10-big-lift-keyboard.png, 11-50-sets.png, 17-lift-progress-500kg.png, 26-full-history.png, 46-run-100mi-1min.png, 48-profile-run-prs.png, 49-gym-card-tap.png, 51-notes-keyboard.png
- Reproduced: yes (each 1/1)
- Suggested fix: Range checks per field (for example weight up to about 1500 lb, pace at least about 3 min/mi) with an "Are you sure?" step; base XP on clamped values; let users delete or edit a logged workout.

### EC-4: Step goal field snaps back to 1000 when cleared, so edits garble the number (typing 100000 gave 1,010,000,000)
- Type: Bug
- Severity: Medium
- Screen: Today > Outdoors > DAILY GOAL
- Steps to reproduce: 1. Tap the 8000 field, delete all digits, type 100000.
- Expected: The field empties and becomes 100000.
- Actual: Deleting one digit at a time: 1000100000 -> ... -> 10 -> 1 -> **1,000** (deleting the last digit puts "1000" back), so new digits mix into the old value. Typing after clearing gave "0 / 1,010,000,000 steps" and then "0 / 1,000,100,000 steps". Values with no sensible limit are accepted (1,010,000,000, and also 1 -> "0 / 1 steps"). In the end 100,000 was set by typing "000" after "100", and it persisted after a kill.
- Evidence: 37-stepgoal-typing.png, 38-stepgoal-100k.png
- Reproduced: yes (3/3 attempts to clear)
- Suggested fix: Keep the raw text while editing and only parse, clamp (for example 1000-100000) and fall back to a default on blur.

### EC-5: Keyboard covers the workout Notes field (typing blind) and the Finish workout button
- Type: UX issue
- Severity: Medium
- Screen: Workout sheet > Details > Notes
- Steps to reproduce: 1. Start a routine. 2. Tap "How did it feel?" and type.
- Expected: The sheet scrolls so the field stays above the keyboard.
- Actual: The Notes field (y 661-733 pt) stays under the keyboard (top at 539 pt); the text can't be seen while typing. With the number pad up (weight/reps), the Finish workout button (546-598) is about 60% covered (keyboard from 566).
- Evidence: 51-notes-keyboard.png, 10-big-lift-keyboard.png
- Reproduced: yes (2/2)
- Suggested fix: Use KeyboardAvoidingView or automatic keyboard insets on the sheet's ScrollView, and scroll the focused input into view.

### EC-6: A 0-kcal food is shown as "analysis incomplete", graded D and gives the pet a JUNK effect
- Type: Bug
- Severity: Medium
- Screen: Meal sheet footer, Today Food card, pet header
- Steps to reproduce: 1. Search "water tap" > "Beverages, water, tap, drinking" > Add to care log. 2. Open Today.
- Expected: Water is a valid 0-kcal item; totals stay exact; no junk penalty.
- Actual: Footer "Grade D · 0 kcal · 0g protein"; Today "4 meals logged — one analysis was incomplete, so this total is approximate."; pet header then shows "Effect: JUNK" next to "Effect: FRESH".
- Evidence: 29-zero-cal-plate.png, 30-zero-cal-incomplete.png, 43-tap-pet.png
- Reproduced: yes (the message stayed for all 7 logs)
- Suggested fix: Treat kcal === 0 with known nutrients as complete (check for null/undefined, not falsy), and don't grade plain water as junk.

### EC-7: A run logged from the Outdoors room counts as a Gym workout; the Outdoors tally stays 0
- Type: Bug
- Severity: Low
- Screen: Today header tallies / Gym card
- Steps to reproduce: 1. Outdoors > Log a run > Running 1 min 100 mi > Finish. 2. Open Today.
- Expected: Outdoors count/XP reflect the run.
- Actual: Header "GYM ✓ · OUTDOORS 0"; Gym card "3 workouts · 13 min · 3 exercises · +64 XP". Outdoors shows only steps.
- Evidence: 49-gym-card-tap.png, 50-today-after-run.png
- Reproduced: once
- Suggested fix: Count cardio sessions toward Outdoors (or label the room action to match where it is counted).

### EC-8: An emoji at the start of the name shows a broken "?" glyph as the avatar initial
- Type: Bug
- Severity: Low
- Screen: Profile header, Edit profile avatar
- Steps to reproduce: 1. Profile > Edit profile > Name "🦦🔥 Zoë 名前 مرحبا" > Save changes.
- Expected: Avatar shows 🦦 (whole grapheme) or a fallback.
- Actual: Avatar shows U+FFFD (black diamond "?"); the name itself shows correctly, with RTL and CJK fine.
- Evidence: 41-emoji-name-saved.png, 42-profile-emoji.png
- Reproduced: yes (2 screens)
- Suggested fix: Take the first grapheme (Array.from(name)[0] or Intl.Segmenter) instead of name[0]/charAt(0).

### EC-9: Weight field visually clips 5-digit values; big numbers aren't formatted
- Type: UX issue
- Severity: Low
- Screen: Workout sheet set rows and summary
- Steps to reproduce: 1. Type 99999 in Set 2 weight.
- Expected: Either a max length that matches the field or the full value visible.
- Actual: The field shows "9999" but its value is 99999 (hierarchy value '99999'); summary "999891103 lb volume" with no thousands separators (later "48994611151 lb volume").
- Evidence: 10-big-lift-keyboard.png, 11-50-sets.png
- Reproduced: yes
- Suggested fix: Set maxLength / clamp, use adjustsFontSizeToFit, format volume with toLocaleString.

### EC-10: Display name is silently cut at 40 characters, and Save changes gives no feedback
- Type: UX issue
- Severity: Low
- Screen: Profile > Edit profile
- Steps to reproduce: 1. Type an 82-character name. 2. Save changes.
- Expected: A counter like Bio's "0 / 280", or a message at the limit; confirmation or navigation after save.
- Actual: Value stops at "Bartholomew Maximilian Fitzgerald-Worthi" (40 chars) with no indication. After Save changes the page stays as it is with no toast (the save did apply, as Profile showed afterwards).
- Evidence: 40-long-name-typing.png, 41-emoji-name-saved.png
- Reproduced: yes (Save 2/2 without feedback)
- Suggested fix: Show "n / 40", and pop back or show "Saved".

### EC-11: Water goal XP is kept after removing all the water again
- Type: Bug
- Severity: Low
- Screen: Today > Water
- Steps to reproduce: 1. Tap + up to 8 cups (68 fl oz): Food XP +20 -> +25. 2. Tap − to 0 fl oz.
- Expected: The XP goes back when the goal is undone (or this is a deliberate rule).
- Actual: Stays +25 / total 37. Not farmable: cycling 0 -> 8 -> 0 cups twice more left XP at 37. There's also no upper cap (17 cups = 144 fl oz accepted); − floors at 0 correctly (20 rapid taps).
- Evidence: 01-water-5taps.png, 02-water-17cups.png
- Reproduced: yes (3/3 cycles)
- Suggested fix: Recompute the water award from the current total, or accept this as intended.

### EC-12: Number-pad fields have no Done key and tapping the nav bar doesn't dismiss them
- Type: UX issue
- Severity: Low
- Screen: Today step goal; workout weight/reps
- Steps to reproduce: 1. Focus the step goal field. 2. Tap the "Today" title.
- Expected: A Done accessory, or tap-anywhere-to-dismiss.
- Actual: The keyboard stays up; it only goes away when tapping a non-input content area (for example the "DAILY GOAL" label, or the exercise header in the workout sheet). Tapping the sheet title "Push day QA" focused the Name field below instead (same text).
- Evidence: 37-stepgoal-typing.png, 11-50-sets.png
- Reproduced: yes (2/2)
- Suggested fix: Add an InputAccessoryView "Done", or keyboardDismissMode / Keyboard.dismiss on tapping the background.

### EC-13: Logging the word puzzle opened from Today returns to the pet room, not to Today
- Type: Design recommendation (subjective)
- Severity: Low
- Screen: Today > Today's word puzzle > Add to care log
- Steps to reproduce: 1. Open the puzzle from Today, solve, Add to care log.
- Expected: Return to Today (where you came from), or a deliberate jump to the pet reaction.
- Actual: Lands on the Study room with Miso's bubble.
- Evidence: 24-after-puzzle-log.png
- Reproduced: once
- Suggested fix: Return to the screen that opened the sheet, or make this consistent across sheets.

### EC-14: Meal plate and the half-typed puzzle row are lost on kill (kept on background)
- Type: UX issue
- Severity: Low
- Screen: Meal sheet; Word puzzle
- Steps to reproduce: 1. Put chicken breast on the plate (or type "BA" in a puzzle row). 2. Background 30 s -> kept. 3. Kill and relaunch.
- Expected: The draft is kept, or at least it is clear that it will be lost.
- Actual: Plate is empty; the puzzle keeps submitted guesses (4 of 6 left) but drops the typed letters.
- Evidence: 21-puzzle-after-kill.png (plate: hierarchy dump after relaunch showed only RECENT)
- Reproduced: once each
- Suggested fix: Persist the meal draft along with the workout draft (EC-2).

### EC-15: True offline (no network) behaviour could not be tested
- Type: Blocked
- Severity: Low
- Screen: Food search, AI photo, chat
- Steps to reproduce: n/a
- Expected: n/a
- Actual: The simulator shares the Mac's network, and disabling Mac networking would affect the other tester and Metro. In local mode, food search reaches USDA and returns results (about 14 s including typing, "chicken breast"); a nonsense query gives "No foods matched that search." right away (no spinner). AI photo is Plus-locked (lock card with "See Plus" and "Search foods instead"; See Plus not tapped). Chat/Friends are hidden (known). Barcode not tested (camera).
- Evidence: 04-search-chicken.png, 27-photo-plus.png, 28-search-nonsense.png
- Reproduced: n/a
- Suggested fix: Test with Network Link Conditioner "100% Loss" on a dedicated machine.

## No-duplicate checks (pass)
- Water + x5 (delay 40): exactly +5 cups (17 -> 59 fl oz); +10 more -> 144 fl oz; − x20 -> 0, no negative.
- Meal Add to care log x4 (delay 30): 1 meal (2 -> 3, 356 -> 462 kcal), XP +10 once (37 -> 47). Extra taps fell through to the room bar (switched to living room), harmless.
- Finish workout x4 (delay 30): 1 workout (Today "2 workouts", Gym +12 -> +24); one GO_BACK LogBox (known, "Log 1 of 1"; metro.log line 52 and line 66 for the later run finish).
- Word puzzle Submit x4 on a full row, 3 times: 1 guess used each time (5 -> 4 -> 3, then solved BANAL in 4/6, +75 points). Add to care log x4: Mind +20 XP once (59 -> 79), "Completed a mind session" once.
- Log workout x3: one sheet. Open pet stats x3: opens Stats, then the next tap hits Stats' "Back to your pet" (same corner): harmless.
- Coins: 50 after one level-up, matching "50 for every level-up".

## Coverage
Passed / exercised:
- Today: water +/- rapid, step goal edit (EC-4), food log totals, activity list, Full history -> Profile.
- Meal: search, nonsense search, Recent re-log, 0-kcal item (EC-1, EC-6), Photo Plus lock, rapid add, background 30 s (kept), kill (lost).
- Workout: routine start, 50 sets (added one at a time; a fast repeat of + Add set hits the moved layout: after each add the button moves down, so repeated taps landed in the new set's weight field, as a real fast tapper would), 1102 lb / 99999 lb, rest timer +background 30 s (kept, wall-clock correct), kill (lost, EC-2), rapid finish, Notes keyboard (EC-5).
- Run: Outdoors > Log a run, 100 mi / 1 min (EC-3, EC-7).
- Word puzzle: rapid submit, background 30 s (kept), kill (guesses kept, partial row lost), solve and log.
- Kill/relaunch x4 (20:47, 20:54, 21:00, 21:19): pet, level/XP, meals, workouts, water (17 fl oz), step goal 100,000, puzzle result, profile name all persisted.
- Room switching: 21 taps across the 5 rooms in a row (Maestro about 5 s per tap, so not truly rapid): ended on the right room (Gym), no errors.
- Sheets: opening the workout sheet then swiping down right away (3 tries, 150 ms and 600 ms swipes): the sheet does not swipe-dismiss at all, only via ×. Not a bug as such, but worth knowing next to the known "close discards work" issue: there's no accidental swipe loss.
- Edit profile: long name (EC-10), emoji/RTL/CJK name (EC-8).
- Once (20:30-21:30) the Today "Back to your pet" tap by text didn't navigate on 2 attempts right after a scroll back to the top; tapping the same point worked, and 0/5 retries reproduced it. Not filed.
Not tested / blocked:
- True offline (EC-15); Apple Health, barcode, camera (simulator); chat and Friends (hidden in local mode); onboarding (already done, per instructions); sim clock / day rollover (not changed, to stay safe); sub-100 ms double taps (no tool faster than Maestro installed).
- metro.log lines 24-25 show `RCTAsyncLocalStorage_V1 ... because there isn't enough space` (no timestamps; they come before my session's entries). With about 7.4 GB free now, AsyncStorage writes may fail without any message to the user. Environmental, but it means data loss on a nearly full device would be silent.
