# Vitto Plus payments

Plus is sold on iOS through the App Store, using RevenueCat. Android and web
still show the paywall, but sell nothing.

## How it works

```
App (PlusPaywall / onboarding)
  └─ billingService ──► RevenueCat SDK ──► Apple's purchase sheet
        │
        └─► billing function { action: 'sync' } ──► RevenueCat REST API
                                                      │
RevenueCat ──webhook──► revenuecat-webhook ──────────┘
                                                      ▼
                                   companion_entitlements (tier, expires_at)
```

- The **only** thing that says who has Plus is the server's
  `companion_entitlements` row. The app never grants Plus itself.
- That row is only ever written after the server asks RevenueCat's API, with
  the secret key, what the user owns (`_shared/revenuecat.ts`). Webhook
  payloads only tell the server to look; their contents are never trusted.
- The Supabase user id is the RevenueCat app user id, so a purchase always
  lands on the account that made it.
- **Store mode** turns on only when both of these are set. Otherwise the app
  falls back to the mock (`MOCK_PAYMENTS`) exactly as before:
  - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in the app
  - `REVENUECAT_SECRET_KEY` on the server
- The free trial is an Apple introductory offer on the yearly product. Apple
  applies it automatically to first-time subscribers, so in store mode the
  paywall has no trial switch. It shows the trial only when the person is
  eligible for it.
- Cancelling happens in Apple's subscription settings. The paywall's
  "Manage subscription" button opens them.

## Going live checklist

### 1. Apple

1. Enrol in the Apple Developer Program ($99/yr). The free Personal Team
   can't sell in-app purchases.
2. In App Store Connect, create the app with bundle ID `com.vitto.app`.
3. Sign the Paid Applications Agreement, and add your tax and banking details
   (Business → Agreements). Products won't load until this is done.
4. Create a subscription group called "Vitto Plus" with two auto-renewable
   subscriptions:
   - `vitto_plus_monthly`: 1 month, $7.99
   - `vitto_plus_yearly`: 1 year, $49.99, with an introductory offer of
     **Free, 2 weeks**
5. Create an In-App Purchase key (Users and Access → Integrations →
   In-App Purchase) and download the `.p8` file. RevenueCat needs it.
6. Host a privacy policy, which App Review requires. Optionally host your own
   terms of use; otherwise the app links Apple's standard EULA.

### 2. RevenueCat

1. Create a project, then add an App Store app with bundle ID `com.vitto.app`.
   Upload the `.p8` key from step 1.5.
2. Create an entitlement named `plus`, and attach both products to it.
3. Create an offering called `default` and mark it **current**. Give it two
   packages:
   - **Monthly** → `vitto_plus_monthly`
   - **Annual** → `vitto_plus_yearly`
4. From API keys, copy two keys:
   - the **public iOS key** (`appl_...`)
   - a **secret key** (`sk_...`)
5. Under Integrations → Webhooks, add a webhook:
   - **URL:** `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`
   - **Authorization header:** `Bearer <a long random string you make up>`

### 3. Supabase

```sh
supabase secrets set REVENUECAT_SECRET_KEY=sk_...
supabase secrets set REVENUECAT_WEBHOOK_AUTH="Bearer <the same random string>"
supabase secrets unset MOCK_PAYMENTS
supabase functions deploy billing
supabase functions deploy revenuecat-webhook --no-verify-jwt
```

`--no-verify-jwt` is required because RevenueCat sends no Supabase token. The
function checks the Authorization header itself, and rejects every request
if that secret is unset.

### 4. The app

In `mobile/.env.local`:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_PRIVACY_URL=https://.../privacy
```

Then rebuild the native app, since `react-native-purchases` is a native module:

```sh
cd mobile && npx expo prebuild -p ios && npx expo run:ios --device
```

### 5. Test before release

1. Create a Sandbox tester in App Store Connect (Users and Access →
   Sandbox), then sign into it on the iPhone (Settings → App Store →
   Sandbox Account).
2. Buy Yearly. Check four things:
   - The 14-day trial shows.
   - Apple's sheet appears.
   - Plus unlocks.
   - The user's row in `companion_entitlements` says `plus`, with an expiry.
3. Sandbox renewals are fast (a yearly plan renews about every hour), so you
   can watch the webhook keep the row current. Check the Supabase function
   logs for `[revenuecat]` lines.
4. Delete the app, reinstall it, sign in, and tap Restore.
5. Cancel in Settings, wait for the sandbox period to end, and confirm the row
   goes back to `free`.
6. In RevenueCat's webhook settings, send a test event. The function should
   answer 200.

## Files

| What | Where |
| --- | --- |
| App-side store logic | `mobile/src/services/billingService.ts` |
| Paywall | `mobile/src/components/PlusPaywall.tsx`, onboarding `plusOffer` step |
| Server verification | `supabase/functions/_shared/revenuecat.ts` |
| `sync` action (plus the mock) | `supabase/functions/billing/index.ts` |
| Webhook | `supabase/functions/revenuecat-webhook/index.ts` |
| Tests | `mobile/src/__tests__/billingService.test.tsx`, `plus.test.tsx` |
