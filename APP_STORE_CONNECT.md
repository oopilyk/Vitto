# App Store Connect brief: Vitto 2.0

For the session filling in App Store Connect through Claude in Chrome. Everything
here was read from the code on 2026-11-10 unless it says **ASK KYLE**. Fill in
drafts, save as you go, and never press **Submit for Review**.

## Ground rules

- Work in a new tab. App: <https://appstoreconnect.apple.com/apps/6820202646>.
  Version **2.0** is in "Prepare for Submission".
- **Kyle does these himself; don't open or change them:**
  - Agreements, Tax and Banking (SSN/EIN, bank details).
  - EU Digital Services Act trader status (it puts his personal contact details on the store page).
  - Apple ID sign-in and 2FA.
  - The final Submit for Review.
- **Ask Kyle before anything priced, public or irreversible:**
  - prices and trial length;
  - territories;
  - deleting anything;
  - any field marked ASK KYLE below.
- Don't invent facts. If a question isn't answered here or in the code, ask.
- When finished, list what was filled, what's left, and what needs Kyle.

## The app, in facts

| | |
|---|---|
| Name on the store | Vitto: Fitness Pet (already set) |
| Bundle id | `com.getvitto.app` (widget extension `com.getvitto.app.petisland`) |
| Apple team | 97N7H43FHH, Kyle Li (individual) |
| Version | 2.0 (`mobile/app.json`: 2.0.0). Builds via EAS, build numbers set remotely. Build 36 failed signing (App Group); the next build should be 37 |
| Platforms | iPhone, and iPad (`supportsTablet: true`, so **iPad screenshots are required**) |
| Minimum age in app | 13. Sign-up asks for birth month and year. Under 18: no weight-loss goals |
| Sign-in | Email only (Supabase). No Google or Facebook sign-in, so Sign in with Apple isn't required |
| Account deletion | In the app: Settings › Delete account (deletes the account server-side) |
| Encryption | `ITSAppUsesNonExemptEncryption: false` is already in the build |
| Analytics / ads / tracking SDKs | None. No App Tracking Transparency |

**What it is:** a virtual pet that grows from your real healthy habits. Logging
meals, workouts, steps, water, sleep, screen time and brain games feeds the
pet's stats, XP, levels and evolution.

**Features:**
- **Food:** a meal photo graded by AI (Plus), food search (USDA and FatSecret), barcode scan (OpenFoodFacts), Quick add, meal slots, copy yesterday's meal, macros and calorie targets.
- **Gym:** a workout logger with routines, rest timer, personal records and strength ranks.
- **Steps and weight:** step goal, and weight tracking with a trend line.
- **Water tracker.**
- **Mind games:** word puzzle, Four Corners, Pet Jeopardy and more.
- **AI chat with the pet**, which can remember things you tell it.
- **Friends:** usernames, visiting a friend's pet, sending reactions.
- **Care partners:** share one pet with someone.
- **Apple Health:** read-only steps, workouts, sleep and meals.
- **On the iPhone itself:** Home Screen widget (with a water button), Live Activity and Dynamic Island, reminders and a weekly recap notification.

**Permissions requested:** camera (meal photos and barcodes), photo library
(choosing a meal photo), HealthKit read only (nothing is written to Health),
notifications.

## Data and who processes it (for App Privacy)

| Data | Where it goes |
|---|---|
| Email, name | Supabase (accounts and database) |
| Body info (age or birth year, sex, height, weight, goal), weigh-ins | Supabase |
| Meals, workouts, steps, water, sleep, screen-time budget, game results | Supabase |
| Apple Health data (steps, workouts, sleep, meals) | Read on the phone, stored in Supabase as the logs above |
| Meal photos | Sent to Anthropic (Claude) for analysis, through a Supabase function |
| AI chat messages, pet memories | Supabase, and sent to Anthropic to write the pet's replies |
| Food search text, barcodes | USDA FoodData Central, FatSecret, OpenFoodFacts (search terms only) |
| Username, bio, the pet | Visible to accepted friends |
| Purchases | Apple and RevenueCat (`react-native-purchases`) |
| Push token | Expo push service |
| Pet voice | Generated on the phone (on-device model); no audio leaves it |

**Suggested App Privacy answers.** Everything is linked to the user, and
nothing is used for tracking. The purpose is App Functionality unless stated.

| Category | Data type | Notes |
|---|---|---|
| Contact Info | Email Address | Sign-in |
| Contact Info | Name | Optional display name |
| Health & Fitness | Health | Weight, body measurements, meals and nutrition, sleep, HealthKit reads |
| Health & Fitness | Fitness | Workouts, steps, exercise |
| User Content | Photos or Videos | Meal photos for analysis |
| User Content | Other User Content | AI chat messages, bio, username |
| Identifiers | User ID | Account id |
| Purchases | Purchase History | Plus subscription |
| Other Data | Other Data Types | Birth month and year (age gate, calorie targets) |

Not collected:
- location;
- contacts;
- browsing or search history (food search terms aren't kept as history);
- diagnostics (no crash or analytics SDK);
- advertising data.

**ASK KYLE** if any of this has changed (for example, a crash reporter added).

## Subscriptions (Vitto Plus)

These must match RevenueCat and the in-app paywall (`mobile/src/services/billingService.ts`).

- **Subscription group:** Vitto Plus.

| Product ID | Duration | Price in app | Intro offer |
|---|---|---|---|
| `com.getvitto.app.plus.monthly` | 1 month | $9.99 | none ("no trial" in onboarding) |
| `com.getvitto.app.plus.yearly` | 1 year | $59.99 ("only $4.99 a month", "save 50%") | 1-week free trial (Introductory Offer: Free, 1 week). The app reads the length from the store and reminds two days before the charge |

**ASK KYLE** to confirm the prices and trial, and whether the products already
exist in App Store Connect. If they exist, check them; don't duplicate them.

Display names and descriptions to propose:

| | Display name | Description |
|---|---|---|
| Yearly | Vitto Plus Yearly | Photo meals, your pet's personality and voice, more chat |
| Monthly | Vitto Plus Monthly | Photo meals, your pet's personality and voice, more chat |

**What Plus adds (from the paywall):**
- photo meal tracking;
- choosing or writing the pet's personality;
- chat at 50 messages a day (free: 5);
- the pet's memory;
- lift progress charts;
- insights;
- the pet talks out loud;
- an in-character voice;
- check-ins at 12 a day (free: 2).

Each subscription needs a review screenshot of the paywall. There isn't one yet:
list it as left to do.

The first subscriptions must be attached to the 2.0 version and submitted with
it. On the version page they go under "In-App Purchases and Subscriptions".

## App Information

- **Subtitle (30 characters max):** `Train, eat well, grow your pet`
- **Category:** primary Health & Fitness, secondary Lifestyle. **ASK KYLE** if he'd rather have Games › Simulation as the secondary.
- **Content rights:** the app shows third-party data (USDA, FatSecret, OpenFoodFacts). Answer that it has the rights; OpenFoodFacts is credited in the app (Settings › Credits).
- **Age rating questionnaire:** answer from the facts above.
  - User-generated content: yes (usernames and bios seen by friends).
  - Messaging or chat: yes (AI chat with the pet; friends send fixed reactions only, no free text).
  - Health and wellness topics: yes.
  - Unrestricted web access, gambling, contests, violence, mature themes: none.
  - Report the resulting rating to Kyle; the app itself requires 13+.
- **Privacy Policy URL:** **ASK KYLE** for the URL. `mobile/.env.local` sets `EXPO_PUBLIC_PRIVACY_URL` (and `EXPO_PUBLIC_TERMS_URL`), so a policy page may already exist; confirm it is public, covers HealthKit data and the AI processing, and is also set in the EAS production environment, or the in-app link stays hidden.
- **Terms:** the app uses Apple's standard EULA (`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`). Leave the custom EULA empty; link the standard one in the description (see below).

## Version 2.0 page

- **Promotional text (170 max):**
  `Your healthy habits raise a pet. Log a meal, finish a workout or hit your steps, and watch your pet grow, evolve and cheer you on.`
- **Keywords (100 max, commas, no spaces, don't repeat words from the name):**
  `workout,calorie,macro,protein,gym,steps,habit,virtual,tracker,food log,weight,diet,streak,cute`
- **Support URL:** **ASK KYLE.**
- **Marketing URL:** optional; leave empty unless Kyle gives one.
- **Copyright:** `2026 Kyle Li` (confirm).
- **What's New:** not needed for a first release.
- **Description** (keep the subscription paragraph; Apple requires it):

```
Vitto turns your healthy habits into a pet that grows with you.

Every meal you log, every workout you finish and every step you take feeds your pet. Look after yourself and it thrives: more energy, more happiness, new levels and new forms as it evolves.

FOOD
• Snap a photo of your plate and get calories and macros (Plus)
• Search foods, scan barcodes, or quick-add calories
• Daily calorie and protein targets built from your goal
• Breakfast, lunch, dinner and snacks, with one-tap repeats

TRAINING
• Log sets with last time's numbers right beside them
• Rest timer on your Lock Screen and in the Dynamic Island
• Personal records the moment you set them, and strength ranks for your big lifts

EVERY DAY
• Step goal, water tracker and weight trend
• Quick brain games to train your mind
• A weekly recap of how you and your pet did
• A Home Screen widget, with a one-tap glass of water

YOUR PET
• Chat with your pet; it remembers what you tell it
• Choose its personality, or write your own (Plus)
• Visit your friends' pets and send them a high five
• Share a pet with a partner and look after it together

Apple Health: Vitto can read your steps, workouts, sleep and meals from Apple Health. It never writes to Apple Health.

Vitto gives general estimates, not medical advice.

VITTO PLUS
Vitto is free to use. Vitto Plus unlocks photo meal tracking, your pet's personality, voice and memory, more chat, lift progress and insights. Plus is available monthly or yearly; the yearly plan starts with a free trial. Payment is charged to your Apple ID at confirmation of purchase (or when the trial ends). Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period, and can be managed or cancelled in your App Store account settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: <PRIVACY POLICY URL>
```

Replace `<PRIVACY POLICY URL>` once Kyle has one. Until then, leave the description saved without that line or with the placeholder, and say so.

- **Screenshots:** Kyle has them (7 for iPhone at 1206 × 2622, 7 for iPad 13" at 2064 × 2752: pet room, Today, log a meal, workout, weight, your week, mind games). They are no longer in the repo; ask Kyle whether they are uploaded already before touching that section.
- **Build:** attach the newest processed build once 37 exists. Build 36 failed and can't be attached.
- **Sign-in information for App Review:** needed, because the app requires an account. **ASK KYLE** for a demo email and password that works in production. Don't create one.
- **Contact information:** Kyle's name and email for App Review. **ASK KYLE** for a phone number.
- **Notes for App Review** (draft):

```
Vitto is a virtual pet that grows from the user's real healthy habits (meals, workouts, steps, water, sleep and brain games).

Sign in with the demo account above. Onboarding asks a few questions and then you meet your pet.

Where things are:
• Log a meal: the kitchen room (burger icon at the bottom) › Log meal. Search, barcode and Quick add are free; meal photo analysis is part of Vitto Plus.
• Log a workout: the gym room › Log workout.
• Today: tap the "Today" ring at the top right of any room for the day's food, steps, water and the weekly recap.
• Chat with the pet: the CHAT button at the top of any room (shown when signed in). The AI replies in the pet's voice.
• Vitto Plus: account menu (top right) › Settings › Vitto Plus. Sandbox purchases work; Restore Purchases is on the same page.
• Delete account: account menu › Settings › Delete account.

Apple Health is optional and read-only: Vitto reads steps, workouts, sleep and meals so other apps' logs feed the pet. It writes nothing to Health.

Meal photos and chat messages are processed by Anthropic's Claude to estimate nutrition and write the pet's replies. No data is used for advertising or tracking.
```

## Known gaps to report to Kyle (don't work around them)

- **Reporting and blocking:** built (migration `20261110120000_report_and_block`, which Kyle deploys with `supabase db push`). Where it is, for the review notes:
  - visiting a friend's pet › "Report or block" under the reactions;
  - touching and holding a friend in Friends;
  - "Report" on a friend request;
  - Friends › Blocked, to unblock.

  Usernames, bios, display names and pet names are filtered for slurs and explicit terms. Reports are stored for Kyle to review in Supabase (`user_reports`), and the app promises a review within 24 hours.
- **Privacy policy:** the in-app paywall hides its privacy link unless `EXPO_PUBLIC_PRIVACY_URL` is set for the production build (it is set in `mobile/.env.local`; confirm the EAS production environment has it too).
- **Supabase migrations** `20261109120000_friend_reactions` and `20261109130000_friend_views_skip_private_logs` (and earlier pending ones) aren't deployed. Kyle runs `supabase db push`.
- **Build 37:** needs Kyle to run `npx eas-cli build --platform ios --profile production` once in his terminal and sign in to Apple, so the App Group gets onto the widget's provisioning profile.
