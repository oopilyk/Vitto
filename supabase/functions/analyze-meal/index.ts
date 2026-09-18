import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required.' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Authentication required.' }, 401);

    const { storagePath, pet } = await request.json();
    if (typeof storagePath !== 'string' || !storagePath.startsWith(`${user.id}/`)) return json({ error: 'Invalid image path.' }, 400);
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
            ailments: Array.isArray(pet.ailments) ? pet.ailments.filter((a: unknown) => typeof a === 'string').slice(0, 5) : [],
          }
        : null;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: image, error: downloadError } = await admin.storage.from('meal-images').download(storagePath);
    if (downloadError) throw downloadError;
    const imageBase64 = Array.from(new Uint8Array(await image.arrayBuffer()), (byte) => String.fromCharCode(byte)).join('');
    const encodedImage = btoa(imageBase64);
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              noFoodDetected: { type: 'BOOLEAN' },
              petReaction: { type: 'STRING' },
              foodDescription: { type: 'STRING' },
              grade: { type: 'STRING', enum: ['A', 'B', 'C', 'D'] },
              summary: { type: 'STRING' },
              confidence: { type: 'NUMBER' },
              detectedFoods: { type: 'ARRAY', items: { type: 'STRING' } },
              macros: {
                type: 'OBJECT',
                properties: {
                  calories: { type: 'NUMBER' },
                  proteinGrams: { type: 'NUMBER' },
                  carbsGrams: { type: 'NUMBER' },
                  fatGrams: { type: 'NUMBER' },
                },
                required: ['calories', 'proteinGrams', 'carbsGrams', 'fatGrams'],
              },
              nutrients: {
                type: 'OBJECT',
                properties: {
                  protein: { type: 'BOOLEAN' },
                  vegetables: { type: 'BOOLEAN' },
                  fruit: { type: 'BOOLEAN' },
                  wholeGrains: { type: 'BOOLEAN' },
                  fiber: { type: 'BOOLEAN' },
                  treats: { type: 'BOOLEAN' },
                },
                required: ['protein', 'vegetables', 'fruit', 'wholeGrains', 'fiber', 'treats'],
              },
            },
            required: ['noFoodDetected', 'foodDescription', 'grade', 'summary', 'confidence', 'detectedFoods', 'macros', 'nutrients'],
          },
        },
        systemInstruction: {
          parts: [{
            text: 'Analyze meal photos for broad nutrition signals only. Never claim medical certainty. ' +
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
              'Also return proteinGrams, carbsGrams, fatGrams as non-negative numbers, detectedFoods (string[]), grade (A-D), confidence (0-1), ' +
              'and nutrients booleans: protein, vegetables, fruit, wholeGrains, fiber, treats. ' +
              'petReaction: if the user message describes a pet, write ONE sentence of at most 90 characters, in the first person AS THAT PET, ' +
              'reacting to how nourishing this plate is — delighted by a balanced plate ("Yum, that was nourishing!"), gently let down by junk ("Ugh, greasy…"). ' +
              'Match the pet\'s personality and mood: energetic is excitable, chill is laid back, competitive wants more, supportive is warm. ' +
              'If the pet is listed as dying or exhausted it sounds weak and brief; if foggy it sounds muddled. ' +
              'Never mention calories, weight, diets or health outcomes, and never shame the person. ' +
              'If no pet is described, or no food was detected, set petReaction to "".',
          }],
        },
        contents: [{ parts: [
          { text: 'Identify and grade this meal for general balanced nutrition.' +
            (petContext
              ? ` The pet about to eat it is ${petContext.name}, a ${petContext.personality} pet who is currently ${petContext.mood}` +
                (petContext.ailments.length > 0 ? ` and ${petContext.ailments.join(', ')}` : '') + '.'
              : '') },
          { inlineData: { mimeType: image.type || 'image/jpeg', data: encodedImage } },
        ] }],
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Gemini ${response.status}: ${details.slice(0, 300)}`);
    }
    const completion = await response.json();
    const analysisText = completion.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysisText) throw new Error('Gemini returned no meal analysis.');
    const analysis = JSON.parse(analysisText);

    const macros = analysis?.macros ?? {};
    const hasMacroSignal = ['calories', 'proteinGrams', 'carbsGrams', 'fatGrams']
      .some((key) => typeof macros[key] === 'number' && macros[key] > 0);
    const foodCount = Array.isArray(analysis?.detectedFoods) ? analysis.detectedFoods.length : 0;
    if (analysis?.noFoodDetected === true || (foodCount === 0 && !hasMacroSignal)) {
      // Nothing edible in frame — don't persist a fabricated graded meal.
      return json({ noFoodDetected: true });
    }

    const { error: insertError } = await admin.from('meal_analyses').insert({ user_id: user.id, storage_path: storagePath, analysis });
    if (insertError) throw insertError;
    return json({ analysis });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Meal analysis failed.' }, 500);
  }
});