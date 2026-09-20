# The AI companion

The pet as a character: it remembers what it is told, its personality drifts with
how its person talks and lives, how close the two of them are grows over time, and
it sometimes speaks first. Ported from the `vittoAI` prototype.

## Where things live

| What | Where |
|---|---|
| Character logic: personality, mood, relationship, memory ranking, prompts, triggers | `packages/core/src/companion/` (pure, vitest) |
| Vitto's data as the pet perceives it | `packages/core/src/domain/companionBridge.ts` |
| Generated Deno copy of the logic | `supabase/functions/_shared/companion/` — **do not edit** |
| Every Claude call, every cap, every write | `supabase/functions/companion/index.ts` |
| Tables, RLS, the entitlement seam | `supabase/migrations/20260920120000_ai_companion.sql` |
| Phone: service, chat screen, plaque | `mobile/src/services/companionService.ts`, `mobile/src/screens/CompanionChatScreen.tsx` |

Edge functions run on Deno, which cannot resolve core's extensionless imports, so
the function carries a generated copy. After changing anything in
`packages/core/src/companion`:

```sh
node scripts/syncCompanion.mjs
```

A core test (`sync.test.ts`) fails if you forget.

## Turning it on

```sh
supabase db push                                   # the migration
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  # server-side only, never in the app
supabase functions deploy companion
```

Until the secret is set the function still answers, from a keyless templated
fallback, so the whole loop can be exercised first. A Claude outage degrades the
same way rather than erroring.

Models default to `claude-sonnet-5` for the voice and `claude-haiku-4-5` for the
background memory pass. Override with `COMPANION_CHAT_MODEL` /
`COMPANION_EXTRACT_MODEL`.

## Security model

The phone sends the person's message and a description of their day. It never
sends a prompt, never picks a model and never holds the key — a client that could
send a prompt would be a free Claude proxy on your bill. The description of the
day is validated field by field (`sanitizeLifeContext`) and rendered into a prompt
the server owns. The companion tables have **no client write policy**: only this
function writes them. State is keyed by `(user_id, pet_id)`, so on a shared pet
one carer's memories never reach the other.

## The paywall

Free for everyone today. The seam is `companion_entitlements`: a payment webhook
upserts `tier = 'plus'` there with the service role and that account gets the
larger allowance. Limits live in `packages/core/src/companion/entitlements.ts` and
are enforced here, over a rolling 24 hours:

| Tier | Messages / day | Unprompted / day |
|---|---|---|
| free | 30 | 6 |
| plus | 200 | 12 |

The caps apply even while the feature is free. Each message costs real money, and
free with no ceiling is an unbounded bill.

## What it costs, measured

Every pet message stores the token usage the API reported. This is the real cost
of the chat model over the last 30 days, at Sonnet 5 list prices ($2 / $10 per
million, cache reads at a tenth):

```sql
select
  count(*)                                                   as pet_messages,
  count(distinct user_id)                                    as people,
  round(sum(
      (usage->>'input_tokens')::numeric               * 2.00 / 1e6
    + (usage->>'cache_read_input_tokens')::numeric    * 0.20 / 1e6
    + (usage->>'cache_creation_input_tokens')::numeric * 2.50 / 1e6
    + (usage->>'output_tokens')::numeric              * 10.00 / 1e6
  ), 4)                                                      as chat_usd,
  round(avg((usage->>'cache_read_input_tokens')::numeric), 0) as avg_cached_tokens
from public.companion_messages
where role = 'pet' and usage is not null and created_at > now() - interval '30 days';
```

`avg_cached_tokens` should sit near 1,400. If it is 0 the stable prompt has
stopped caching: something per-user crept into `STABLE_SYSTEM_PROMPT`, or it
shrank under the model's 1,024-token minimum. A core test guards both.
