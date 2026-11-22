/**
 * A meal said or typed in a sentence, turned into foods from the database.
 *
 * The app reads the plain sentences itself, for free ("2 eggs, 150 g rice":
 * see core's mealText). What reaches this function is what needs judgment:
 * "a big bowl of chicken curry with rice and a coke". The model splits it into
 * foods and sizes them, the server looks each one up in FatSecret and USDA,
 * and the model picks the entry that is that food (see describePrompt.ts).
 * The reply is database foods with serving counts, which the app puts on the
 * plate to be checked and logged like any other.
 *
 * Words only: two small-model calls of a few thousand tokens, about a tenth
 * of a cent together. Capped per account all the same, and claimed before the
 * model is asked (see _shared/aiBudget.ts).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.126.0/helpers/zod';
import { z } from 'npm:zod@4.6.5';
import { BUSY_MESSAGE, claimAiCall } from '../_shared/aiBudget.ts';
import { isDevAccount } from '../_shared/devAccount.ts';
import { searchFatsecret, searchUsda } from '../_shared/foodSources.ts';
import {
  FATSECRET_CANDIDATES,
  ITEMS_SYSTEM_PROMPT,
  MAX_TEXT_LENGTH,
  PICKS_SYSTEM_PROMPT,
  USDA_CANDIDATES,
  candidatesFor,
  itemsUserText,
  mealItemsSchema,
  mealPicksSchema,
  picksUserText,
  readItems,
  resolvePicks,
} from './describePrompt.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * Described meals a day that reach the model. The sentences the app reads on
 * its own never get here and are not counted. Free accounts get enough for a
 * day's meals; Plus gets enough that nobody logging real meals meets it.
 */
const FREE_PER_DAY = 5;
const PLUS_PER_DAY = 30;
const DEV_PER_DAY = 100_000;

/** Words in, a short list out: a small model does this well. Override with DESCRIBE_MODEL. */
const DESCRIBE_MODEL = Deno.env.get('DESCRIBE_MODEL') ?? 'claude-haiku-5-5';
const anthropic = Deno.env.get('ANTHROPIC_API_KEY') ? new Anthropic({ timeout: 20_000, maxRetries: 1 }) : null;

const ItemsSchema = mealItemsSchema(z);
const PicksSchema = mealPicksSchema(z);

/** USDA's whole foods only: FatSecret carries the brands, with real servings. */
const USDA_WHOLE_FOODS = 'Foundation,SR Legacy';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required.' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Authentication required.' }, 401);

    const { text: rawText, key } = (await request.json().catch(() => ({}))) as { text?: unknown; key?: unknown };
    const text = typeof rawText === 'string' ? rawText.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH) : '';
    if (!text) return json({ error: 'Say or type what you ate.' }, 400);
    const appKey = typeof key === 'string' && /^[A-Za-z0-9]{1,64}$/.test(key) ? key : null;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // The tier comes from the verified session and the server's own record,
    // as it does for photos: no client can claim Plus.
    const isDev = isDevAccount(user);
    let plus = isDev;
    if (!isDev) {
      const { data: entitlement } = await admin.from('companion_entitlements').select('tier, expires_at').eq('user_id', user.id).maybeSingle();
      const lapsed = entitlement?.expires_at && Date.parse(entitlement.expires_at) < Date.now();
      plus = entitlement?.tier === 'plus' && !lapsed;
    }
    const limit = isDev ? DEV_PER_DAY : plus ? PLUS_PER_DAY : FREE_PER_DAY;
    const claim = await claimAiCall(admin, user.id, 'meal_text', limit, plus ? 'plus' : 'free');
    if (claim === 'user_limit') {
      return json(
        {
          error: plus
            ? `That's ${PLUS_PER_DAY} described meals today. Search or scan your food until tomorrow.`
            : `That's today's ${FREE_PER_DAY} described meals. List each food with an amount ("2 eggs, 150 g rice"), search, or get Plus for more.`,
        },
        429,
      );
    }
    if (claim === 'global_limit') return json({ error: BUSY_MESSAGE }, 503);
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not configured.');

    // 1. The foods in the sentence.
    const split = await anthropic.messages.parse({
      model: DESCRIBE_MODEL,
      max_tokens: 2048,
      // Haiku 5.5 thinks unless told not to, billed as output and out of max_tokens.
      thinking: { type: 'disabled' },
      system: ITEMS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: itemsUserText(text) }],
      output_config: { format: zodOutputFormat(ItemsSchema) },
    });
    if (!split.parsed_output) throw new Error(`No foods read (stop_reason: ${split.stop_reason}).`);
    const items = readItems(split.parsed_output);
    if (!split.parsed_output.isFood || items.length === 0) return json({ notFood: true });

    // 2. Each food's entries, from both databases at once. A source that
    // fails has no candidates; the food can still be estimated.
    const candidates = await Promise.all(
      items.map(async (item, index) => {
        const [fatsecret, usda] = await Promise.all([
          searchFatsecret(item.query, String(FATSECRET_CANDIDATES)),
          searchUsda(item.query, appKey, { pageSize: String(USDA_CANDIDATES), dataTypes: USDA_WHOLE_FOODS }).catch(() => []),
        ]);
        return candidatesFor(index, fatsecret, usda);
      }),
    );

    // 3. Which entry each food is, and how much of it.
    const picked = await anthropic.messages.parse({
      model: DESCRIBE_MODEL,
      max_tokens: 2048,
      thinking: { type: 'disabled' },
      system: PICKS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: picksUserText(items, candidates) }],
      output_config: { format: zodOutputFormat(PicksSchema) },
    });
    if (!picked.parsed_output) throw new Error(`No foods picked (stop_reason: ${picked.stop_reason}).`);

    const result = resolvePicks(items, candidates, picked.parsed_output);
    if (result.items.length === 0) return json({ notFood: true });
    return json(result);
  } catch (error) {
    // The detail goes to the logs, never to the caller.
    console.error('[describe-meal] failed', error);
    return json({ error: 'Could not read that meal. Try again.' }, 500);
  }
});
