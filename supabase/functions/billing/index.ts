import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refreshEntitlement, storeConfigured } from '../_shared/revenuecat.ts';

/**
 * MOCK payments for Vitto Plus.
 *
 * Stands in for the real store (App Store / Play billing, or Stripe on web)
 * until one is wired up, so the paywall, the upgrade and the downgrade can be
 * built and tested end to end. "Buying" writes `plus` into the caller's own
 * `companion_entitlements` row, exactly the row a real payment webhook will
 * write later -- so everything downstream (the model split, the caps, the
 * personalities) behaves as it will for a real subscriber.
 *
 * It hands out Plus for free, so it FAILS CLOSED: nothing works unless the
 * MOCK_PAYMENTS secret is set to `true`. Never set it in production.
 *
 *   supabase secrets set MOCK_PAYMENTS=true
 *   supabase functions deploy billing
 *
 * REAL purchases (the App Store, through RevenueCat) need only the one action
 * here, `sync`, and it works whatever MOCK_PAYMENTS says: see
 * _shared/revenuecat.ts and the revenuecat-webhook function.
 *
 * Actions (all for the signed-in user only; there is no way to name anyone else):
 *   status              -> { enabled, store, tier, expiresAt }. `enabled` is
 *                          MOCK_PAYMENTS; `store` is whether real purchases can
 *                          be verified (the RevenueCat secret is set).
 *   sync                -> re-reads this user's App Store purchases from
 *                          RevenueCat, writes the entitlement, returns status.
 *   purchase { plan, trial } -> plan 'monthly' | 'yearly'. `trial` (yearly only)
 *                          adds TRIAL_DAYS free up front. Plus until the
 *                          period ends.
 *   cancel              -> back to free now (a real store would run to period end)
 */

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DAY_MS = 24 * 60 * 60 * 1000;
/** What each plan buys. Prices live in the app; nothing is charged. */
const PLAN_DAYS = { monthly: 30, yearly: 365 } as const;
type Plan = keyof typeof PLAN_DAYS;
/** The free trial, offered on the yearly plan only. */
const TRIAL_DAYS = 14;

const mockEnabled = () => Deno.env.get('MOCK_PAYMENTS') === 'true';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required.' }, 401);
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Authentication required.' }, 401);

    const body = await request.json().catch(() => null);
    const action = body?.action;
    // The service role, because the table has no write policy on purpose: a
    // client that could write its own entitlement could simply give itself Plus.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const current = async () => {
      const { data } = await admin.from('companion_entitlements').select('tier, expires_at').eq('user_id', user.id).maybeSingle();
      const expiresAt = data?.expires_at ? Date.parse(data.expires_at) : null;
      const active = data?.tier === 'plus' && (expiresAt === null || expiresAt > Date.now());
      return {
        enabled: mockEnabled(),
        store: storeConfigured(),
        tier: active ? 'plus' : 'free',
        expiresAt: active && data?.expires_at ? data.expires_at : null,
      };
    };

    if (action === 'status') return json(await current());

    if (action === 'sync') {
      if (!storeConfigured()) return json({ error: 'Purchases are not set up yet.' }, 503);
      await refreshEntitlement(admin, user.id);
      return json(await current());
    }

    if (!mockEnabled()) return json({ error: 'Test purchases are switched off.' }, 403);

    if (action === 'purchase') {
      const plan = body?.plan as Plan;
      if (!(plan in PLAN_DAYS)) return json({ error: 'Unknown plan.' }, 400);
      const trial = body?.trial === true && plan === 'yearly';
      const now = Date.now();
      // Buying again while subscribed extends from the current end, like a renewal.
      const status = await current();
      // A grant that never lapses (set by hand) must not be replaced by a plan that does.
      if (status.tier === 'plus' && status.expiresAt === null) return json(status);
      const from = status.tier === 'plus' && status.expiresAt ? Math.max(now, Date.parse(status.expiresAt)) : now;
      const expiresAt = new Date(from + (PLAN_DAYS[plan] + (trial ? TRIAL_DAYS : 0)) * DAY_MS).toISOString();
      const { error } = await admin.from('companion_entitlements').upsert(
        { user_id: user.id, tier: 'plus', expires_at: expiresAt, updated_at: new Date(now).toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      console.log(`[billing] MOCK purchase: ${user.id} ${plan}${trial ? ' + trial' : ''} until ${expiresAt}`);
      return json(await current());
    }

    if (action === 'cancel') {
      const { error } = await admin.from('companion_entitlements').upsert(
        { user_id: user.id, tier: 'free', expires_at: null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      console.log(`[billing] MOCK cancel: ${user.id}`);
      return json(await current());
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('[billing] failed', error);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
