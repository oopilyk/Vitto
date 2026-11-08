# UI/UX review — findings (UIR)

Agent: qa-ui-reviewer · iPhone 17 Pro (5062CC77) · light, dark and extra-extra-large text · offline local mode · 2026-11-06 evening.
Screenshots: `qa-artifacts/screenshots/ui-review/` (file names below). Saved by the QA lead from the agent's returned report.

## Defects (objective)

| ID | Sev | Screen | Finding | Repro | Evidence |
|---|---|---|---|---|---|
| UIR-1 | High | Meal sheet › Scan barcode | "Allow camera" button renders as a ~78×128 pt box, label pinned to its top; title touches the dashed border | 2/2 (light, dark) | 47-meal-barcode, 79-dark-barcode |
| UIR-2 | High | Workout & meal sheets | × closes and discards in-progress work with no prompt (ticked sets, plate items); reopening shows an empty sheet | 1/1 each | 58, 60, 61, 46, 49 |
| UIR-3 | Medium | Workout sets, Your preferences | No "Done" bar above the number pad (2/2 workout, 1/1 prefs); keypad half-covers Finish; weight uses an integer pad, so 22.5 lb can't be typed. Tapping outside does dismiss. | 2/2 | 56, 57, 13 |
| UIR-4 | Medium | Today, Mind sheet vs their children | At night with "System · Light", Today and Mind are dark while Food trends, Lift progress, word puzzle, sheets are light — flips on push/back; contradicts Appearance copy ("Text, cards and buttons all follow the theme"). Mind-over-room reads as intended; Today doesn't. | Today 3/3, Mind 2/2 | 24→28, 33, 35→38, 10 |
| UIR-5 | Medium | Mind sheet | "MIND TODAY" card ~355 pt tall; pet tile stretched to an 86×330 strip; lowercase "no games yet today" | 3/3 | 35, 67, 100 |
| UIR-6 | Medium | Today, paywall, Settings, rest timer, meal header | XXL text truncation: Remaining ring "1,9…"; paywall subtitles (some even at default size); Settings Plus subtitle; "Rest · Bench Pr…"; meal × pushed into the sheet corner | 1/1 per screen (paywall 3×) | 96, 95, 19, 93, 99, 98 |
| UIR-7 | Medium | Lift progress from Today | Back reads "‹ Profile" but returns to Today | once | 33, 34 |
| UIR-8 | Medium | Food trends, 30 days | X-axis labels show "1.."; switching 7→30 moves the selection to the same bar index (Wed Oct 14 · 0 kcal); low-value bars nearly invisible (esp. dark) | once | 32, 31, 76 |
| UIR-9 | Medium | Plus paywall | × (32 pt) scrolls under the status bar onto the clock; first tap after scrolling missed; odd gap in the FREE/PLUS header | once | 20, 19 |
| UIR-10 | Medium | Many | Touch targets < 44 pt: menu rows ~38; Today back 60×32, water −/+ 34, "1 meal ▸" 26 tall, text links 14–24 tall; Profile ↗ 32; Stats Share 64×16, ⓘ 24; sheet × 30; plate stepper 30; set ✓ 30, remove-set 28; rest buttons ~36; paywall × 32 | measured | hierarchy dumps; 24, 46, 55, 62 |
| UIR-11 | Low | Animals & forms | Locked cards fade labels to ~1.5–2:1 contrast, worst in dark | 2/2 | 17, 73 |
| UIR-12 | Low | Outdoors room (+ Log a run sheet) | Status bar unreadable over the tree art; nearly vanishes under the sheet | once | 01, 65 |
| UIR-13 | Low | Today water | "1 cup = 8.5 fl oz" but totals read 8 fl oz per cup | yes | 25 |
| UIR-14 | Low | Stats, Today Mind card | Word puzzle with one guess made still reads "not played yet" / "Nothing completed yet" | once | 41, 63 |
| UIR-15 | Low | Headers everywhere | Back/close position, size and title size differ screen to screen (x16–22 / y54–62; 17 vs 22 pt vs large title; × 30/40/32, right vs left) | yes | 04, 08, 17, 24, 62, 35, 19 |
| UIR-16 | Low | Profile › Personal Records | Wrapped lift names push values ~13 pt below neighbours | yes | 04, 92 |
| UIR-17 | Low | Workout sheet | Visible label ≠ accessibility label ("Pick exercises" read as "Add exercise"; "+ Create a routine" as "Make a new routine") — breaks Voice Control | yes | 50 + hierarchy |
| UIR-18 | Low | Meal › Search | First result ~1 pt under the field; Recent rows inset 6 pt more than their label | yes | 45, 43 |

## Recommendations (subjective)
- **UIR-19** Five "go to more" styles ("›" row, "▸", "→", "↗", Credits "›" that opens an alert): use › rows for navigation, one link style.
- **UIR-20** Mixed card/control styles: outlined vs filled cards; grouped vs bare toggles in Settings sub-pages; segmented controls 36 vs 48 pt; underline tabs vs segmented; coral vs green selection ticks; four eyebrow conventions.
- **UIR-21** Plus-locked features open four different ways; signed-out paywall shows no price or Terms/Restore (couldn't judge that state).
- **UIR-22** Pixel/Apple seams: smooth "+ Log" pill over pixel rooms; Apple cards pasted over the pixel study in Mind; a third typeface in the word puzzle; extra illustration styles in Profile; tapping the pet shows no visible response.
- **UIR-23** Smaller: picker keyboard covers its Done footer, no muscle-group headers, empty list card below few results; volume counts unticked prefilled sets; "Save as routine" doesn't look tappable; word puzzle "Not now" left-aligned, closing returns to Today not Mind; Privacy Policy leaves the app; system-blue cursor; "Private to you" twice in Preferences; no Delete account row seen (may be signed-in only).

## Motion and feedback
Couldn't judge easing or springs: every capture was already settled, because Maestro's post-tap delay is longer than the animations. Haptics can't be checked in the simulator. Food search answered in under 0.5 s, so no spinner was seen. Seen working: ticked set row turns green; rest timer counts down with a bar; word puzzle marks use colour plus a symbol.

## Polish score (out of 10, against intended style)
Rooms 8.5 (outdoors status bar 7) · Account menu 6.5 · Profile 7 · Settings list 8.5 · Appearance 8 · What affects Miso 7 · Your preferences 7 · Notifications 7 · Animals & forms 6 · Personality (locked) 7.5 · Credits 7 · Plus paywall 6 · Today 6.5 · Food trends 5.5 · Lift progress 6.5 · Pet stats 7.5 · Mind sheet 5 · Word puzzle 8 · Meal search/Recent 7.5 · Meal photo (locked) 7.5 · Meal scan barcode 3 · Exercise picker 7 · Set table + rest timer 7.5 · Log a run picker 6.5 · Dark mode overall 8 · XXL text overall 6.

## Coverage
Exercised: all 5 rooms, pet tap, account menu; Profile; Settings list + Appearance, What affects Miso, Your preferences (keypad), Notifications, Animals & forms, Personality, Pet voice (→ paywall), Credits, Privacy (→ Safari); paywall (look only); Today all cards → Food trends (7/30, tap a day), Lift progress (locked); Mind sheet (from Today and Study); word puzzle (one guess); meal sheet Search, Recent, Scan, Photo-locked; workout picker, set table with Last, both keypads, ✓ + rest timer, Skip, close/discard; Log a run picker; Pet stats + Body info. Dark: room, Profile, Settings, Animals, paywall, Today, Food trends, Stats, meal, barcode, picker, set table. XXL: room, menu, Profile, Settings, Preferences, paywall, Today, meal, set table + rest, Mind.

Not tested: Step trends / Outdoors card (Steps turned off in What affects Miso — left alone); camera, barcode, Apple Health; sign-in and paid paywall; Friends and chat (no entry point offline); other Mind games; mid-animation frames; haptics.

Logs: only known KEYCHAIN noise and "Sending onAnimatedValueUpdate with no listeners" WARNs during this run; an AsyncStorage "No space left on device" error in metro.log came from the iPhone Air simulator while the disk was full.

## QA lead notes (code check, not the agent's)
- UIR-7 cause: the "from Today" flag was put on the **Profile** screen's lift link (App.tsx ~2745) instead of Today's (~3129). One-line fix.
- UIR-3 cause (likely): `KeyboardDoneBar` (an `InputAccessoryView`) is mounted once at the app root. Under the New Architecture, the accessory only attaches to inputs it can find in its own view tree when it mounts, so inputs in sheets or mounted later never get it. Fix: render the bar next to the inputs (inside `NumberField` and each screen with number fields).
