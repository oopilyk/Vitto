import { type MealAnalysis, parseMealAnalysisResponse } from '@vitto/core';
import { supabase } from './supabaseClient';

/** Base64 of a file's bytes, in chunks so a large photo cannot overflow the call stack. */
const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** The photo goes to `analyze-meal` in the request and is never stored; only the analysis is. */
export const analyzeMealImage = async (file: File): Promise<MealAnalysis> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before analyzing a meal.');

  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { image: { base64: await toBase64(file), mimeType: file.type || 'image/jpeg' } },
  });
  if (error) {
    const response = 'context' in error && error.context instanceof Response ? error.context : null;
    if (response) {
      try {
        const details = await response.json() as { error?: string };
        if (details.error === 'PLUS_REQUIRED') {
          throw new Error('Photo meal tracking is part of Vitto Plus. Search for the food instead.');
        }
        throw new Error(details.error || error.message);
      } catch (cause) {
        if (cause instanceof Error && cause.message !== error.message) throw cause;
      }
    }
    throw error;
  }
  return parseMealAnalysisResponse(data);
};