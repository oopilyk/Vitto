# `notify` — the pet speaking to a closed app

The companion already decides *whether* and *why* the pet should speak
(`pickProactiveTrigger`, in `packages/core/src/companion/triggers.ts`, unit
tested there). Until this function existed that decision could only be acted on
while the app was open, so the pet could only ever reach somebody who was
already coming.

This is the delivery half. It runs on a schedule, finds the people whose pet has
something to say, respects the hour where *they* are, generates the message and
hands it to Expo.

## Layout

| Piece | Where |
|---|---|
| When the pet may speak, and about what | `packages/core/src/companion/triggers.ts` |
| Quiet hours, local day boundary | same file (`inQuietHours`, `localDayStart`) |
| The model call, and the cached system prompt | `supabase/functions/_shared/model.ts` |
| Sending, and pruning dead tokens | `supabase/functions/_shared/push.ts` |
| Device rows, cached context | `20260924120000_push_notifications.sql` |
| Registering a device | the `companion` function, `registerDevice` action |
| The phone's side | `mobile/src/services/pushService.ts` |

Anything about the pet's *character* belongs in `packages/core`, where vitest
covers it, and reaches here through `scripts/syncCompanion.mjs`. Nothing in this
folder should decide what the pet is like.

## Setup

**1. Secrets.** `ANTHROPIC_API_KEY` is already set for the companion and is
shared. This function needs one more:

```sh
supabase secrets set NOTIFY_SECRET="$(openssl rand -hex 32)"
```

There is no user session behind a cron call, so that secret is the whole of the
authentication. Without it the function refuses to run (503) rather than
running open.

**2. Deploy without the JWT gate.** The Supabase gateway rejects unauthenticated
calls before the function runs, and a cron job has no user JWT. This flag is
required on *every* deploy of this function — the project has no `config.toml`,
so there is nowhere durable to record it:

```sh
supabase functions deploy notify --no-verify-jwt
```

**3. Schedule it.** Run this in the SQL editor with the secret substituted. It
is not a migration on purpose: a migration carrying a live secret would be
committed to the repository.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'vitto-notify',
  '0 * * * *',                      -- hourly, on the hour
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/notify',
    headers := '{"Content-Type":"application/json","x-notify-secret":"<NOTIFY_SECRET>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

Hourly is enough. Every rule that waits for a particular time waits for the
*evening*, and the per-day cap (`TIER_LIMITS.proactivePerDay`) is reached long
before twenty-four chances are used. To stop it: `select cron.unschedule('vitto-notify');`

**4. An EAS project id.** Expo mints push tokens per project, so without one no
device can ever register and this function will correctly find nobody to talk
to. Run `eas init` in `mobile/`, which writes `extra.eas.projectId` into
`app.json` — the one place `pushService.ts` looks. Until then the app reports
`unconfigured` and carries on without notifications.

## Trying it

```sh
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/notify' \
  -H "x-notify-secret: $NOTIFY_SECRET"
```

It answers with what it did, and changes nothing when there is nothing to say:

```json
{ "considered": 12, "sent": 3, "failed": 0, "invalidTokens": [] }
```

`{"considered": 0, ... "reason": "nobody awake"}` is the normal answer at 3am,
and the normal answer when no device has registered yet.

## The staleness problem

Every trigger needs a `LifeContext` — pet stats, today's totals, the local
clock — which the **phone** builds from the app's own screens. This job has no
phone to ask. It reads the last one the app cached
(`companion_state.last_life`, written on every companion request) and handles
the gap in three ways:

* **Triggers whose meaning survives a stale snapshot** are allowed through:
  absence, a remembered important event, a missed workout habit — all read from
  the event log, which is current.
* **`streak_at_risk` is re-checked against today's real events** before it may
  fire. It is the one rule that reads today's totals out of the snapshot, so it
  is the one that could nudge somebody about a streak they already kept.
* **The model is told how old the figures are** when the snapshot is over three
  hours old, so the pet speaks from how it feels rather than reciting numbers it
  has not actually seen.

## Things that were deliberate

* **Quiet hours are checked before anything is generated.** No model call is
  ever spent on a message that cannot be sent, and a pet that wakes somebody at
  3am gets the app deleted at 3:01.
* **Event reactions are held back for six hours.** While an unreacted event is
  fresh the person is probably still in the app, which handles it far better
  than a notification would. Once it is stale they clearly are not, so it goes.
* **The message is stored before it is sent.** It is in the conversation when
  the notification is tapped, and a failed send cannot produce it twice.
* **`registerDevice` only writes `enabled` when the caller says so.** Every
  launch re-registers to refresh the timezone, and defaulting it to true there
  would silently switch notifications back on for somebody who turned them off.
* **Tokens Expo rejects are deleted.** A token dies when the app is deleted, and
  left in place it costs a slot on every future run.

## Cost

One notification is one Sonnet call with the same cached prompt the chat uses —
about half a cent, and bounded by `proactivePerDay` (6 free, 12 plus). A user
who is sent the free maximum every day costs roughly **$0.90 a month**, and
almost nobody will trigger six a day: the rules are quiet by design.
