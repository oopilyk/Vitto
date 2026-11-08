# First-time user QA — findings (FT)

Agent: qa-first-time-user · iPhone 17 Pro (iOS 26.5, UDID 5062CC77-7050-48D5-A616-19FBDCDFCE11) · light mode · offline local mode · 18:05–19:23, 2026-11-06.
Screenshots 00–91: `qa-artifacts/screenshots/first-time/`. (Saved by the QA lead from the agent's returned report; the agent's own file write was blocked.)

Counts: Critical 0 · High 2 · Medium 6 · Low 8 · Blocked 1 (17 entries). First-impression score 6/10.

| ID | Sev | Type | Screen | Title | Repro | Evidence |
|---|---|---|---|---|---|---|
| FT-1 | Medium | UX | Onboarding | 20 steps; two Next-only filler screens (steps 3, 7); body stats all required, only "Your name" skippable | once | 02, 04, 14, 15–34 |
| FT-2 | Low | UX | Onboarding "By when?" | Only 3 months visible; Mar 2027 fully off-screen with no peek; no "No deadline"; Next disabled until picked | 2/2 | 22, 24 |
| FT-3 | Low | UX | Onboarding goal weight → date | First chip tap with number pad open only closes the keyboard (layout jumps) | once | 21, 22 |
| FT-4 | Low | Design rec. | Onboarding "What should keep Miso healthy?" | Multi-select shown by tint only; nothing says pick several | once | 12, 13 |
| FT-5 | High | Bug | Workout → Finish workout | Red LogBox "The action 'GO_BACK' was not handled by any navigator" on every save; WorkoutScreen.tsx:273 → App.tsx:3209 `navigation.goBack()`; suggests the sheet is closed twice | 2/2 | 57, 58, 66 |
| FT-6 | High (Blocked/UX) | UX | Rooms, Profile, Settings | No way to find pet chat or Friends offline (entry points only passed when `isOnline`, App.tsx:2657/2669); no "sign in to chat" hint; room's a11y label "Say hi to Miso" does nothing | 3 methods | 82, 83, 84, 86, 89 |
| FT-7 | Medium | UX | Living room | The landing room has no action, unlike every other room | yes | 37, 82 |
| FT-8 | Medium | Bug | Settings (from account menu) | "‹ Profile" back link goes to the Gym room, not Profile | once | 75, 81 |
| FT-9 | Low | Bug (unconfirmed) | Account menu | First tap on PROFILE closed the menu without navigating; worked by label on retry (may be tap placement) | once | 85 |
| FT-10 | Medium | UX | Workout sets | Number pad: no Done key seen, tapping outside doesn't dismiss, covers Finish; only a swipe on content closed it; Maestro hideKeyboard failed | 2 tries | 63, 64, 65 |
| FT-11 | Medium | Design/UX | Today, Mind sheet vs others | With Appearance "System · Light", Today and Mind render dark (after ~7 pm) while Food trends, Stats, Settings, Profile, sheets are light; Today → Trends → back is jarring | yes | 70, 71, 73, 90 |
| FT-12 | Low | Bug (layout) | Mind sheet | "MIND TODAY" card ~400 pt tall, mostly empty | once | 90 |
| FT-13 | Medium | Copy | Many | Jargon / mixed names: "Add to care log" vs "Finish workout" vs "care moments" (Stats 3 vs Profile 4); eyebrows "NOURISHMENT CHECK" / "VITTO / TRAINING"; unexplained FRESH, Grade B, Vitality, "Hunger 73/100" direction, Pushing/Pulling, Forms, "Runner?", "6% of today's fuel", PR "27th · Novice"; default "Strength session" name even for Running | n/a | 41, 42, 67–70, 85 |
| FT-14 | Low | Copy | After first meal | "Hello, world" achievement; two achievement modals stack back to back | once | 42, 43 |
| FT-15 | Low | UX | Exercise picker | Search "run" ranks Crunches, Cable Crunch above Running | once | 52 |
| FT-16 | Low | UX | Meal search | Raw USDA names ("Bananas, raw", "Babyfood, banana…"), per-100 g only | once | 40, 41 |
| FT-17 | Low | Bug | After onboarding | Hierarchy dump while showing the kitchen still contained onboarding "Step 13 of 20" — stack possibly still mounted (VoiceOver could read it) | once | 38 + hierarchy 18:29 |

Noise seen (not bugs): KEYCHAIN_ACCESS toast on launch; "Sending onAnimatedValueUpdate with no listeners" WARN ×3; "Open debugger to view warnings" toast after the tour.

## Coverage
**Passed:** onboarding (all 20 steps through "Start today"); first-run tour opened (not every card stepped); meal via search → servings → Add, achievements, Recent list shows it, + expands to stepper, round × closes; workout picker (67 moves, search, Done count), sets, ✓ starts rest timer (−15/+15/Skip, Skip works), + Add set, second workout shows Last (45 × 8), Finish works (with FT-5); Pet stats; Today (XP, rings, macros, water +1 cup → Today's activity, Gym, Mind); Food "Trends & averages" empty state; account menu → Settings → Your preferences: goal Lose fat → Maintain saved, calorie target 1,565 → 1,965, subtitle updates; Profile; Outdoors "Log a run" visible; Study → Mind sheet → × closes.

**Failed / partial:** FT-5, FT-8, FT-10, FT-12.

**Not tested:** pet chat & Friends (hidden offline); sign-up/sign-in (out of scope); Photo · Plus, barcode, Apple Health, notifications (simulator); Plus paywall (not opened); out of time: Lift progress, Log a run, mind games and word puzzle play-through, Appearance, Notifications, Animals & forms, 30-day trends, dark mode, large text.

## First ten minutes (agent's narrative, condensed)
Warm opening and a charming pet pick, then a 20-step intake form before meeting the pet. The landing room has nothing to do. Meal and workout logging take 3–5 taps; the rest timer and Last column are pleasant surprises; Recent makes re-logging one tap. A red dev error on every workout save, a number pad that won't go away, a dark Today page next to light Trends, and no visible way to talk to the pet. Score 6/10.
