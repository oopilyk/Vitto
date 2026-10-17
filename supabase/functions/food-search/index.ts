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

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DATA_TYPES = 'Foundation,SR Legacy,Branded';
const PAGE_SIZE = '25';
const MAX_QUERY_LENGTH = 100;
const TIMEOUT_MS = 10_000;

const FATSECRET = 'https://platform.fatsecret.com/rest';
const FATSECRET_RESULTS = '20';

/** RFC 3986 percent-encoding, which OAuth 1.0 signs with (encodeURIComponent leaves !'()* alone). */
const encode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * A FatSecret GET, signed with OAuth 1.0 (HMAC-SHA1, consumer key and secret,
 * no token). Null when the server has no FatSecret keys, so a missing secret
 * reads as "FatSecret has nothing", never as a failed search.
 */
const fatsecretGet = async (path: string, params: Record<string, string>): Promise<Record<string, unknown> | null> => {
  const consumerKey = Deno.env.get('FATSECRET_CONSUMER_KEY');
  const consumerSecret = Deno.env.get('FATSECRET_CONSUMER_SECRET');
  if (!consumerKey || !consumerSecret) return null;

  const url = `${FATSECRET}${path}`;
  const all: Record<string, string> = {
    ...params,
    format: 'json',
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  const paramString = Object.keys(all)
    .sort()
    .map((key) => `${encode(key)}=${encode(all[key]!)}`)
    .join('&');
  const base = `GET&${encode(url)}&${encode(paramString)}`;
  const signingKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${encode(consumerSecret)}&`),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(base)))));

  const response = await fetch(`${url}?${paramString}&oauth_signature=${encode(signature)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`FatSecret ${path} answered ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  // FatSecret reports its own errors (bad signature, quota, no match) in a 200.
  if (data.error) throw Object.assign(new Error(`FatSecret ${path}: ${JSON.stringify(data.error)}`), { fatsecret: data.error });
  return data;
};

/** FatSecret's foods for a query, as it sends them (the app maps them). Never throws. */
const searchFatsecret = async (text: string): Promise<unknown[]> => {
  try {
    const data = await fatsecretGet('/foods/search/v5', {
      search_expression: text,
      max_results: FATSECRET_RESULTS,
      flag_default_serving: 'true',
    });
    const food = (data?.foods_search as { results?: { food?: unknown } } | undefined)?.results?.food;
    // A single hit comes back as an object, not a one-item list.
    return Array.isArray(food) ? food : food ? [food] : [];
  } catch (error) {
    console.error('[food-search] fatsecret search failed', error);
    return [];
  }
};

/**
 * One barcode's food from FatSecret, or null. FatSecret wants GTIN-13: a UPC-A
 * (12 digits) or EAN-8 is the same number zero-padded on the left.
 */
const barcodeFatsecret = async (barcode: string): Promise<unknown | null> => {
  try {
    const data = await fatsecretGet('/food/barcode/find-by-id/v2', {
      barcode: barcode.padStart(13, '0'),
      flag_default_serving: 'true',
    });
    return data?.food ?? null;
  } catch (error) {
    // 211 is "no food for that barcode": an answer, not a failure.
    if ((error as { fatsecret?: { code?: number | string } }).fatsecret?.code?.toString() !== '211') {
      console.error('[food-search] fatsecret barcode failed', error);
    }
    return null;
  }
};

/** USDA's foods for a query. Throws a status-carrying error the caller turns into a reply. */
const searchUsda = async (text: string, appKey: string | null): Promise<unknown[]> => {
  // The server's own key when one is set (FDC_API_KEY); otherwise the app's
  // public one, which it already ships in its bundle; otherwise USDA's demo key.
  const apiKey = Deno.env.get('FDC_API_KEY') ?? appKey ?? 'DEMO_KEY';
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', text);
  url.searchParams.set('pageSize', PAGE_SIZE);
  url.searchParams.set('dataType', DATA_TYPES);

  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 429) throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
  if (!response.ok) throw Object.assign(new Error('UPSTREAM_FAILED'), { status: 502 });
  const data = (await response.json()) as { foods?: unknown[] };
  return Array.isArray(data.foods) ? data.foods : [];
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
