/**
 * Food search by name, and barcode lookup, from the server.
 *
 * The app used to ask USDA FoodData Central straight from the phone, and some
 * networks' DNS cannot resolve api.nal.usda.gov (it is a chain of government
 * cloud aliases), so search failed with "hostname could not be found" while
 * everything else worked. Every phone that can use Vitto can already reach
 * Supabase, so the lookup happens here and the results go back unchanged: the
 * app maps them exactly as it maps a direct reply (see core's foodDatabase).
 *
 * FatSecret too, when the app asks for it (`sources: ['usda', 'fatsecret']`)
 * and the server has its keys (FATSECRET_CONSUMER_KEY / _SECRET). It carries
 * the branded and restaurant foods USDA does not, with real servings ("1
 * medium", "1 bar"), and looks barcodes up (`barcode`). Its calls are signed
 * with OAuth 1.0, not 2.0: 2.0 only answers whitelisted IP addresses, and an
 * edge function has no fixed one. A build that does not ask for FatSecret gets
 * exactly what it always got.
 *
 * Fixed shapes only: this is not a general proxy. And only for a signed-in
 * user: the server's keys have quotas, and an open endpoint would let anyone
 * with the app's public key spend them for everybody.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { barcodeFatsecret, searchFatsecret, searchUsda } from '../_shared/foodSources.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MAX_QUERY_LENGTH = 100;

/** Per account, barcode lookups included. See the food_search_limit migration. */
const SEARCHES_PER_HOUR = 60;
const SEARCHES_PER_DAY = 300;

/**
 * Claims one search against the account's limit. Fails OPEN, unlike the AI
 * budget: what is at stake is a free quota, not a bill, and failing closed
 * would break FatSecret for everyone if this function went out before its
 * migration.
 */
const claimSearch = async (userId: string): Promise<boolean> => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('claim_food_search', {
    p_user: userId,
    p_hour_limit: SEARCHES_PER_HOUR,
    p_day_limit: SEARCHES_PER_DAY,
  });
  if (error) {
    console.error('[food-search] limit check failed; allowing the search', error);
    return true;
  }
  return data !== false;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required.' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Authentication required.' }, 401);
    if (!(await claimSearch(user.id))) return json({ error: 'RATE_LIMITED' }, 429);

    const { query, key, sources, barcode } = (await request.json().catch(() => ({}))) as {
      query?: unknown; key?: unknown; sources?: unknown; barcode?: unknown;
    };

    if (typeof barcode === 'string') {
      if (!/^\d{8,14}$/.test(barcode)) return json({ food: null });
      return json({ food: await barcodeFatsecret(barcode) });
    }

    const text = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY_LENGTH) : '';
    const wantsFatsecret = Array.isArray(sources) && sources.includes('fatsecret');
    if (!text) return json(wantsFatsecret ? { foods: [], fatsecret: [] } : { foods: [] });

    const appKey = typeof key === 'string' && /^[A-Za-z0-9]{1,64}$/.test(key) ? key : null;

    if (!wantsFatsecret) {
      // What every build before FatSecret asks for, answered as it always was.
      try {
        return json({ foods: await searchUsda(text, appKey) });
      } catch (error) {
        const status = (error as { status?: number }).status ?? 502;
        return json({ error: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_FAILED' }, status);
      }
    }

    // Both at once. Either failing still answers with the other; only both
    // failing is a failed search.
    const [usda, fatsecret] = await Promise.all([
      searchUsda(text, appKey).then((foods) => ({ foods }), (error) => ({ error: error as { status?: number } })),
      searchFatsecret(text),
    ]);
    if ('error' in usda && fatsecret.length === 0) {
      const status = usda.error.status ?? 502;
      return json({ error: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_FAILED' }, status);
    }
    return json({ foods: 'foods' in usda ? usda.foods : [], fatsecret });
  } catch (error) {
    console.error('[food-search] failed', error);
    return json({ error: 'UPSTREAM_FAILED' }, 502);
  }
});
