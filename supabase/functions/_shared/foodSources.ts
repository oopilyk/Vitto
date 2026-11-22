/**
 * The food databases, asked from the server: FatSecret (branded and restaurant
 * foods, real servings, barcodes) and USDA FoodData Central (whole foods).
 *
 * Shared by `food-search` (the app's search box and barcode scanner) and
 * `describe-meal` (a meal said in a sentence, whose foods are looked up here).
 * The replies go back as each source sends them: the app maps them in one
 * place (core's foodDatabase).
 */

const DATA_TYPES = 'Foundation,SR Legacy,Branded';
const PAGE_SIZE = '25';
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
export const fatsecretGet = async (path: string, params: Record<string, string>): Promise<Record<string, unknown> | null> => {
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
export const searchFatsecret = async (text: string, maxResults: string = FATSECRET_RESULTS): Promise<unknown[]> => {
  try {
    const data = await fatsecretGet('/foods/search/v5', {
      search_expression: text,
      max_results: maxResults,
      flag_default_serving: 'true',
    });
    const food = (data?.foods_search as { results?: { food?: unknown } } | undefined)?.results?.food;
    // A single hit comes back as an object, not a one-item list.
    return Array.isArray(food) ? food : food ? [food] : [];
  } catch (error) {
    console.error('[foodSources] fatsecret search failed', error);
    return [];
  }
};

/**
 * One barcode's food from FatSecret, or null. FatSecret wants GTIN-13: a UPC-A
 * (12 digits) or EAN-8 is the same number zero-padded on the left.
 */
export const barcodeFatsecret = async (barcode: string): Promise<unknown | null> => {
  try {
    const data = await fatsecretGet('/food/barcode/find-by-id/v2', {
      barcode: barcode.padStart(13, '0'),
      flag_default_serving: 'true',
    });
    return data?.food ?? null;
  } catch (error) {
    // 211 is "no food for that barcode": an answer, not a failure.
    if ((error as { fatsecret?: { code?: number | string } }).fatsecret?.code?.toString() !== '211') {
      console.error('[foodSources] fatsecret barcode failed', error);
    }
    return null;
  }
};

/** USDA's foods for a query. Throws a status-carrying error the caller turns into a reply. */
export const searchUsda = async (
  text: string,
  appKey: string | null,
  { pageSize = PAGE_SIZE, dataTypes = DATA_TYPES }: { pageSize?: string; dataTypes?: string } = {},
): Promise<unknown[]> => {
  // The server's own key when one is set (FDC_API_KEY); otherwise the app's
  // public one, which it already ships in its bundle; otherwise USDA's demo key.
  const apiKey = Deno.env.get('FDC_API_KEY') ?? appKey ?? 'DEMO_KEY';
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', text);
  url.searchParams.set('pageSize', pageSize);
  url.searchParams.set('dataType', dataTypes);

  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 429) throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
  if (!response.ok) throw Object.assign(new Error('UPSTREAM_FAILED'), { status: 502 });
  const data = (await response.json()) as { foods?: unknown[] };
  return Array.isArray(data.foods) ? data.foods : [];
};
