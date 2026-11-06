# Vitto QA brief (shared by every QA agent)

## Ground rules
- **Do not modify app code** (`mobile/`, `web/`, `packages/`, `supabase/`). You may only write under `qa/` and `qa-artifacts/`.
- Never fabricate. Only report an interaction as tested if you ran it and saw the result (screenshot or hierarchy dump).
- No purchases (the Plus paywall: look, never tap Subscribe/Buy/Restore), no messages to real people, no destructive actions on real data.
- The app runs in **offline local mode** (Supabase disabled in Metro), so data lives only on that simulator. Sign-up/sign-in against the real backend is out of scope for this pass: report it as blocked, don't try.
- Don't get stuck: two failed attempts at the same step → write it down as blocked and move on.

## Environment
- App: Vitto (Expo SDK 57 / React Native 0.86, New Architecture), bundle id `com.getvitto.app`, Debug build served by Metro at `localhost:8082` (local mode). Don't stop Metro, and don't touch port 8081 (that one isn't ours).
- Each agent owns **one simulator UDID**, given in its prompt. Use only that one: `--device <UDID>` on every maestro command and `xcrun simctl ... <UDID>`.
- Env for every maestro call: `export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true`

## Driving the simulator
- See what's on screen (texts, accessibility labels, bounds in points):
  `maestro --device $UDID hierarchy > /tmp/h.json` then parse it, e.g.
  `python3 /Users/kli/dev/vitto/qa/tools/visible.py /tmp/h.json` (prints text/label + bounds).
- Act by writing a tiny flow and running it: `maestro --device $UDID test /path/flow.yaml`
  ```yaml
  appId: com.getvitto.app
  ---
  - tapOn: "Get started"            # visible text or accessibility label
  - tapOn: { id: "sheet-close" }    # testID
  - tapOn: { point: "50%,90%" }
  - inputText: "Miso"
  - eraseText: 10
  - hideKeyboard
  - swipe: { direction: UP }        # scrolls
  - scrollUntilVisible: { element: "Trends & averages", direction: DOWN }
  - assertVisible: "Today"
  - back                            # (Android only; on iOS use the on-screen back control or swipe from left edge: swipe start "2%,50%" end "90%,50%")
  ```
  Batch several steps into one flow: each maestro launch costs ~10 s.
- Screenshot: `xcrun simctl io $UDID screenshot /Users/kli/dev/vitto/qa-artifacts/screenshots/<agent>/<nn>-<what>.png`, then Read the PNG to actually look at it.
- Background / foreground: `xcrun simctl launch $UDID com.apple.Preferences` then `xcrun simctl launch $UDID com.getvitto.app`.
- Kill and relaunch: `xcrun simctl terminate $UDID com.getvitto.app; xcrun simctl launch $UDID com.getvitto.app` (wait ~10 s for the JS bundle).
- Dark mode: `xcrun simctl ui $UDID appearance dark|light`. Bigger text: `xcrun simctl ui $UDID content_size extra-extra-large` (reset: `large`).
- JS errors and warnings land in `/Users/kli/dev/vitto/qa-artifacts/logs/metro.log` (shared by all simulators; quote lines with timestamps you saw appear while you acted). A red/yellow LogBox toast at the bottom of the screen is a dev-build JS error/warning — record its text.
- Known dev-only noise, not a bug: `[expo-notifications] Error reading persisted server registration info … KEYCHAIN_ACCESS` on launch in the simulator. Its LogBox toast sits over the bottom button (e.g. "Get started"): dismiss it by tapping its × (right end of the toast, about x=92%, y=93%) after every launch.
- Two testers run at once on separate simulators; Metro is shared, so a bundle reload you see may be the other tester's relaunch, not a bug.
- Time budget: aim to finish within about 60–90 minutes of work. Write findings as you go.

## The app, briefly
Health + virtual pet. Onboarding adopts a pet; the main screen is a pixel-art room (living room, gym, kitchen, outdoors, study, switched by a row of icons at the bottom) with a "+ Log …" action per room. Logging sheets: Meal (photo is Plus; search/barcode free; Recent meals), Workout (exercises, sets, Last column, ✓ starts a rest timer), Mind games, Word puzzle, water on Today. "Today" page (from the dashboard) has Food/Outdoors/Gym/Mind cards with "Trends & averages" pages. Profile, Settings (many sub-pages), Friends, pet chat. Apple Health, push, camera and barcode don't work meaningfully in the simulator: note as untestable, don't fight them.

## Reporting
Write `qa-artifacts/<agent>/findings.md`. One entry per issue:

```
### <AGENT>-<n>: <one-line title>
- Type: Bug | UX issue | Design recommendation (subjective) | Blocked
- Severity: Critical | High | Medium | Low
- Screen:
- Steps to reproduce: 1. … 2. …
- Expected:
- Actual:
- Evidence: screenshot path(s) / log lines
- Reproduced: yes (n/n tries) | once | not retried
- Suggested fix:
```

Then a `## Coverage` section: every screen/flow you actually exercised (pass/fail), and everything you could not test and why. Keep a running file — write as you go, so nothing is lost if you run out of time.
