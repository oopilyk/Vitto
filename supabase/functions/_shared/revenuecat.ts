import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Real App Store purchases, as RevenueCat reports them.
 *
 * Every write of a paid entitlement goes through `refreshEntitlement`, which
 * asks RevenueCat's REST API what this user owns right now and writes exactly
 * that into `companion_entitlements` -- the row everything downstream reads.
 * A webhook payload is never trusted for the answer, only as a nudge to go and
 * look: the REST API is authenticated with our secret key, so what it says
 * cannot be forged by whoever can reach the webhook URL, and re-reading the
 * whole state makes events arriving late, twice or out of order harmless.
 *
 * Secrets (supabase secrets set ...):
 *   REVENUECAT_SECRET_KEY    a RevenueCat secret API key (sk_...), v1 subscribers read
 *   REVENUECAT_ENTITLEMENT   the entitlement identifier, default "plus"
 */

const API = 'https://api.revenuecat.com/v1/subscribers/';

export const storeConfigured = () => Boolean(Deno.env.get('REVENUECAT_SECRET_KEY'));

const ENTITLEMENT = () => Deno.env.get('REVENUECAT_ENTITLEMENT') || 'plus';

/** Supabase user ids are UUIDs; RevenueCat's own anonymous ids ($RCAnonymousID:...) are not ours to write. */
export const isUserId = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

interface StoreEntitlement {
  tier: 'free' | 'plus';
  /** When it lapses; null for one that never does (a lifetime grant in RevenueCat). */
  expiresAt: string | null;
}

/** What RevenueCat says this user is entitled to right now. */
export const fetchEntitlement = async (userId: string): Promise<StoreEntitlement> => {
  const response = await fetch(API + encodeURIComponent(userId), {
    headers: { Authorization: `Bearer ${Deno.env.get('REVENUECAT_SECRET_KEY')}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`RevenueCat answered ${response.status}`);
  const body = await response.json();
  const entitlement = body?.subscriber?.entitlements?.[ENTITLEMENT()];
  if (!entitlement) return { tier: 'free', expiresAt: null };
  // A billing problem keeps access through Apple's grace period, so the later
  // of the two ends is the one that counts.
  const ends = [entitlement.expires_date, entitlement.grace_period_expires_date]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (entitlement.expires_date === null && ends.length === 0) return { tier: 'plus', expiresAt: null };
  const end = Math.max(...ends);
  return end > Date.now() ? { tier: 'plus', expiresAt: new Date(end).toISOString() } : { tier: 'free', expiresAt: null };
};

/**
 * Re-reads the user from RevenueCat and writes the row. A grant made by hand
 * (plus, never lapsing) is left alone: the store knows nothing about it, and
 * "not subscribed" must not take it away.
 */
export const refreshEntitlement = async (admin: SupabaseClient, userId: string) => {
  const { data: existing } = await admin
    .from('companion_entitlements')
    .select('tier, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing?.tier === 'plus' && existing.expires_at === null) return;

  const next = await fetchEntitlement(userId);
  const { error } = await admin.from('companion_entitlements').upsert(
    { user_id: userId, tier: next.tier, expires_at: next.expiresAt, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
  console.log(`[revenuecat] ${userId} -> ${next.tier}${next.expiresAt ? ` until ${next.expiresAt}` : ''}`);
};
