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

    const { storagePath } = await request.json();
    if (typeof storagePath !== 'string' || !storagePath.startsWith(`${user.id}/`)) return json({ error: 'Invalid image path.' }, 400);
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
        generationConfig: { responseMimeType: 'application/json' },
        systemInstruction: { parts: [{ text: 'Analyze meal photos for broad nutrition signals only. Never claim medical certainty. Return JSON with grade (A-D), summary, confidence (0-1), detectedFoods (string[]), and nutrients booleans: protein, vegetables, fruit, wholeGrains, fiber, treats.' }] },
        contents: [{ parts: [{ text: 'Grade this meal for general balanced nutrition.' }, { inlineData: { mimeType: image.type || 'image/jpeg', data: encodedImage } }] }],
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
    const { error: insertError } = await admin.from('meal_analyses').insert({ user_id: user.id, storage_path: storagePath, analysis });
    if (insertError) throw insertError;
    return json({ analysis });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Meal analysis failed.' }, 500);
  }
});