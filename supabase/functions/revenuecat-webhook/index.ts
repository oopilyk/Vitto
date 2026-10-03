import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isUserId, refreshEntitlement, storeConfigured } from '../_shared/revenuecat.ts';

/**
 * RevenueCat's webhook: purchases, renewals, cancellations, refunds, billing
 * problems and lapses all arrive here, and each one just has the affected
 * users re-read from RevenueCat (see _shared/revenuecat.ts) -- the event is a
 * nudge, never the answer.
 *
 * RevenueCat sends no Supabase JWT, so this is deployed without JWT checks and
 * checks its own shared secret instead, set as the webhook's Authorization
 * header in the RevenueCat dashboard:
 *
 *   supabase secrets set REVENUECAT_WEBHOOK_AUTH="Bearer <long random string>"
 *   supabase functions deploy revenuecat-webhook --no-verify-jwt
 *
 * Anything but a 2xx makes RevenueCat retry, so a failure to refresh answers
 * 500 on purpose.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Compares without leaking, through timing, how much of a guess was right. */
const sameSecret = (given: string, expected: string) => {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  // Fails closed: with no secret set, nothing is accepted.
  if (!expected || !sameSecret(request.headers.get('Authorization') ?? '', expected)) {
    return json({ error: 'Unauthorized.' }, 401);
  }
  if (!storeConfigured()) return json({ error: 'REVENUECAT_SECRET_KEY is not set.' }, 500);

  const body = await request.json().catch(() => null);
  const event = body?.event;
  if (!event) return json({ error: 'No event.' }, 400);

  // Everyone the event touches: the buyer under every id they have had, and
  // both sides of a transfer (a restore that moved a purchase between accounts).
  const ids = new Set<string>(
    [
      event.app_user_id,
      event.original_app_user_id,
      ...(Array.isArray(event.aliases) ? event.aliases : []),
      ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
      ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
    ].filter(isUserId),
  );

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    for (const id of ids) {
      // A user who has since deleted their account has no row to write: skip.
      const { data } = await admin.auth.admin.getUserById(id);
      if (!data?.user) continue;
      // eslint-disable-next-line no-await-in-loop
      await refreshEntitlement(admin, id);
    }
    return json({ ok: true, type: event.type, users: ids.size });
  } catch (error) {
    console.error('[revenuecat-webhook] failed', error);
    return json({ error: 'Refresh failed.' }, 500);
  }
});
