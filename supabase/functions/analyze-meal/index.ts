import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.126.0/helpers/zod';
import { z } from 'npm:zod@4.6.5';
import { BUSY_MESSAGE, claimAiCall } from '../_shared/aiBudget.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

/**
 * Photos a single account may send for analysis in a rolling 24 hours.
 *
 * Every call sends an image to Claude at about a cent each, so this is also
 * what keeps a Plus subscription profitable: ten covers three meals and
 * snacks with room for retakes, and search and barcode scanning stay free and
 * unlimited past it. Counted by attempt (see _shared/aiBudget.ts), so a photo
 * with no food in it, or one the model fails on, counts the same as a meal.
 */
const MEALS_PER_DAY = 10;
/** The dev account's cap: effectively none, but still recorded. */
const DEV_MEALS_PER_DAY = 100_000;

/**
 * The largest photo accepted. The app sends a compressed one (`quality: 0.6`),
 * well under this; the cap is what keeps a hand-made request from becoming an
 * edge-function OOM.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** The whole request: an 8 MB photo as base64 is about 11 MB, plus a little. */
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
/** What the model can read (see ClaudeImageType). */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * The model that reads the plate. Estimating portions from a photo is where a
 * stronger model earns its price, and photo tracking is Plus-only and capped,
 * so the bill per subscriber stays small. Override with MEAL_MODEL.
 */
const MEAL_MODEL = Deno.env.get('MEAL_MODEL') ?? 'claude-sonnet-5-5';

/**
 * Its own client rather than the companion's: a photo takes longer to read than
 * a chat reply, and the companion's 20s timeout is sized for chat.
 */
const anthropic = Deno.env.get('ANTHROPIC_API_KEY') ? new Anthropic({ timeout: 45_000, maxRetries: 1 }) : null;

/**
 * What the bytes actually are, from their first few. Claude checks the bytes
 * against the declared type and refuses a mismatch, and the declared type is
 * not reliable (the web picker labels a JPEG image/png), so the bytes win.
 * Null for anything else, HEIC included.
 */
const sniffImageType = (base64: string): ClaudeImageType | null => {
  let head: string;
  try {
    head = atob(base64.slice(0, 24));
  } catch {
    return null;
  }
  const bytes = Array.from(head, (char) => char.charCodeAt(0));
  const starts = (...sig: number[]) => sig.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
};

/** The image types Claude reads. HEIC is not one; the app's picker sends JPEG. */
type ClaudeImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** What the model must return; the app's parseMealAnalysisResponse reads exactly this. */
const MealAnalysisSchema = z.object({
  noFoodDetected: z.boolean(),
  petReaction: z.string(),
  foodDescription: z.string(),
  grade: z.enum(['A', 'B', 'C', 'D']),
  summary: z.string(),
  confidence: z.number(),
  detectedFoods: z.array(z.string()),
  macros: z.object({
    calories: z.number(),
    proteinGrams: z.number(),
    carbsGrams: z.number(),
    fatGrams: z.number(),
    fiberGrams: z.number(),
    sugarGrams: z.number(),
    saturatedFatGrams: z.number(),
    sodiumMg: z.number(),
  }),
  nutrients: z.object({
    protein: z.boolean(),
    vegetables: z.boolean(),
    fruit: z.boolean(),
    wholeGrains: z.boolean(),
    fiber: z.boolean(),
    treats: z.boolean(),
  }),
});

const MEAL_SYSTEM_PROMPT =
  'Analyze meal photos for broad nutrition signals only. Never claim medical certainty. ' +
  'First decide whether the image actually shows food or drink meant to be eaten. ' +
  'If it shows no edible food (an empty plate, a person, a pet, a room, a screenshot, a blurry or dark frame, packaging with nothing to eat visible), ' +
  'set noFoodDetected to true, detectedFoods to [], every macros value to 0, grade to "D", confidence to your certainty that there is no food, ' +
  'foodDescription to "" and summary to a one-sentence note that no meal was visible. Do not invent a meal. ' +
  'Otherwise set noFoodDetected to false and describe the meal. ' +
  'foodDescription must start immediately with a concise, quantified list of every food item you see and its estimated portion, ' +
  'with no introductory words — for example "80g of mac and cheese, 1 chocolate chip cookie (~10g), 2 chicken tenders (~10g each)". ' +
  'Estimate portions from visual cues: compare items to the plate/bowl rim, standard utensils and known package sizes; ' +
  'prefer typical single-serving portions when scale is ambiguous rather than extreme values. ' +
  'summary is a separate short paragraph judging the nutritional quality of the meal (what it is rich in or lacking). ' +
  'When noFoodDetected is false, macros.calories must be a realistic non-zero estimate for the portions described in foodDescription — ' +
  'derive it from the estimated grams of protein, carbs and fat (4/4/9 kcal per gram) and sanity-check it against the portions. ' +
  'Also return proteinGrams, carbsGrams, fatGrams as non-negative numbers, and the sub-macros fiberGrams, sugarGrams and saturatedFatGrams (grams, each part of the carbs or fat) and sodiumMg (milligrams), estimated the same way from the foods and portions you see, ' +
  'with fiberGrams and sugarGrams no more than carbsGrams and saturatedFatGrams no more than fatGrams, detectedFoods (string[]), grade (A-D), confidence (0-1), ' +
  'and nutrients booleans: protein, vegetables, fruit, wholeGrains, fiber, treats. ' +
  'petReaction: if the user message describes a pet, write ONE sentence of at most 90 characters, in the first person AS THAT PET, ' +
  'reacting to how nourishing this plate is — delighted by a balanced plate ("Yum, that was nourishing!"), gently let down by junk ("Ugh, greasy…"). ' +
  'Match the pet\'s personality and mood: energetic is excitable, chill is laid back, competitive wants more, supportive is warm. ' +
  'If the pet is listed as dying or exhausted it sounds weak and brief; if foggy it sounds muddled. ' +
  'Never mention calories, weight, diets or health outcomes, and never shame the person. ' +
  'If no pet is described, or no food was detected, set petReaction to "".';

/** Treated as Plus; the same list as the companion function's. */
const DEV_EMAILS = new Set(['kyleyli2005@gmail.com']);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required.' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Authentication required.' }, 401);

    // The photo arrives in the request and goes no further than the model: it
    // is never written to storage, a table or a log. Only the analysis is kept.
    // Refused before it is read into memory: a photo is well under this.
    if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) {
      return json({ error: 'That image is too large to analyse.' }, 413);
    }
    const { image, pet } = (await request.json().catch(() => ({}))) as { image?: { base64?: unknown; mimeType?: unknown }; pet?: Record<string, unknown> };
    const imageBase64 = typeof image?.base64 === 'string' ? image.base64 : '';
    if (!imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return json({ error: 'That photo could not be read.' }, 400);
    // The bytes say what the image is; the label the app sent is only a fallback.
    const declared = typeof image?.mimeType === 'string' ? image.mimeType.toLowerCase() : 'image/jpeg';
    const imageType = sniffImageType(imageBase64) ?? declared;
    if (!IMAGE_TYPES.has(imageType)) return json({ error: 'That kind of image is not supported.' }, 415);
    // Base64 is 4 characters per 3 bytes.
    if (Math.floor((imageBase64.length * 3) / 4) > MAX_IMAGE_BYTES) {
      return json({ error: 'That image is too large to analyse.' }, 413);
    }
    // Optional. With it the model also writes the pet's one-line reaction to the
    // plate, in character; without it (the web app) the analysis is unchanged.
    // Only the pet's name, personality and how it feels are sent — nothing
    // about the person.
    const petContext =
      pet && typeof pet === 'object' && typeof pet.name === 'string'
        ? {
            name: String(pet.name).slice(0, 40),
            personality: typeof pet.personality === 'string' ? pet.personality.slice(0, 20) : 'friendly',
            mood: typeof pet.mood === 'string' ? pet.mood.slice(0, 20) : 'content',
            ailments: Array.isArray(pet.ailments)
              ? pet.ailments.filter((a: unknown): a is string => typeof a === 'string').slice(0, 5).map((a: string) => a.slice(0, 24))
              : [],
          }
        : null;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Photo macro tracking is a Plus feature. Decided here from the verified
    // session and the server-side entitlement, so no client can claim it; the
    // dev account counts as Plus, as it does in the companion function.
    const isDev = DEV_EMAILS.has((user.email ?? '').trim().toLowerCase());
    if (!isDev) {
      const { data: entitlement } = await admin
        .from('companion_entitlements')
        .select('tier, expires_at')
        .eq('user_id', user.id)
        .maybeSingle();
      const lapsed = entitlement?.expires_at && Date.parse(entitlement.expires_at) < Date.now();
      if (entitlement?.tier !== 'plus' || lapsed) {
        return json({ error: 'PLUS_REQUIRED' }, 402);
      }
    }

    // Claimed before the photo goes to the model, atomically, so a burst of
    // simultaneous requests cannot all slip under the cap.
    // Photos are Plus-only (checked above), so they draw on the paid budget.
    const claim = await claimAiCall(admin, user.id, 'meal_photo', isDev ? DEV_MEALS_PER_DAY : MEALS_PER_DAY, 'plus');
    if (claim === 'user_limit') return json({ error: "That's 10 photos today. Search or scan your food until tomorrow." }, 429);
    if (claim === 'global_limit') return json({ error: BUSY_MESSAGE }, 503);

    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not configured.');
    const response = await anthropic.messages.parse({
      model: MEAL_MODEL,
      max_tokens: 1500,
      system: MEAL_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageType as ClaudeImageType, data: imageBase64 } },
          {
            type: 'text',
            text: 'Identify and grade this meal for general balanced nutrition.' +
              (petContext
                ? ` The pet about to eat it is ${petContext.name}, a ${petContext.personality} pet who is currently ${petContext.mood}` +
                  (petContext.ailments.length > 0 ? ` and ${petContext.ailments.join(', ')}` : '') + '.'
                : ''),
          },
        ],
      }],
      output_config: { format: zodOutputFormat(MealAnalysisSchema) },
    });
    const analysis = response.parsed_output;
    if (!analysis) throw new Error('Claude returned no meal analysis.');

    const hasMacroSignal = Object.values(analysis.macros).some((value) => value > 0);
    const foodCount = analysis.detectedFoods.length;
    if (analysis.noFoodDetected || (foodCount === 0 && !hasMacroSignal)) {
      // Nothing edible in frame — don't persist a fabricated graded meal.
      return json({ noFoodDetected: true });
    }

    const { error: insertError } = await admin.from('meal_analyses').insert({ user_id: user.id, analysis });
    if (insertError) throw insertError;
    return json({ analysis });
  } catch (error) {
    // The detail goes to the logs, never to the caller.
    console.error('[analyze-meal] failed', error);
    return json({ error: 'Meal analysis failed. Try again.' }, 500);
  }
});