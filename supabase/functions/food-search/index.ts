/**
 * Food search by name, looked up from the server.
 *
 * The app used to ask USDA FoodData Central straight from the phone, and some
 * networks' DNS cannot resolve api.nal.usda.gov (it is a chain of government
 * cloud aliases), so search failed with "hostname could not be found" while
 * everything else worked. Every phone that can use Vitto can already reach
 * Supabase, so the lookup happens here and the results go back unchanged: the
 * app maps them exactly as it maps a direct reply (see core's foodDatabase).
 *
 * Only USDA's search, with a fixed shape: this is not a general proxy. And
 * only for a signed-in user: the server's USDA key has an hourly quota, and an
 * open endpoint would let anyone with the app's public key spend it for
 * everybody.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DATA_TYPES = 'Foundation,SR Legacy,Branded';
const PAGE_SIZE = '25';
const MAX_QUERY_LENGTH = 100;
const TIMEOUT_MS = 10_000;

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

    const { query, key } = (await request.json().catch(() => ({}))) as { query?: unknown; key?: unknown };
    const text = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY_LENGTH) : '';
    if (!text) return json({ foods: [] });

    // The server's own key when one is set (FDC_API_KEY); otherwise the app's
    // public one, which it already ships in its bundle; otherwise USDA's demo key.
    const appKey = typeof key === 'string' && /^[A-Za-z0-9]{1,64}$/.test(key) ? key : null;
    const apiKey = Deno.env.get('FDC_API_KEY') ?? appKey ?? 'DEMO_KEY';

    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('query', text);
    url.searchParams.set('pageSize', PAGE_SIZE);
    url.searchParams.set('dataType', DATA_TYPES);

    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 429) return json({ error: 'RATE_LIMITED' }, 429);
    if (!response.ok) return json({ error: 'UPSTREAM_FAILED' }, 502);
    const data = (await response.json()) as { foods?: unknown[] };
    return json({ foods: Array.isArray(data.foods) ? data.foods : [] });
  } catch (error) {
    console.error('[food-search] failed', error);
    return json({ error: 'UPSTREAM_FAILED' }, 502);
  }
});
