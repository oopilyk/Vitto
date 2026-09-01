import { type MealAnalysis, withEstimatedCalories } from '@vitto/core';
import { supabase } from './supabaseClient';

const bucket = 'meal-images';

export const analyzeMealImage = async (file: File): Promise<MealAnalysis> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before analyzing a meal.');

  const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { storagePath: path },
  });
  if (error) {
    const response = 'context' in error && error.context instanceof Response ? error.context : null;
    if (response) {
      try {
        const details = await response.json() as { error?: string };
        throw new Error(details.error || error.message);
      } catch (cause) {
        if (cause instanceof Error && cause.message !== error.message) throw cause;
      }
    }
    throw error;
  }
  return withEstimatedCalories(data.analysis as MealAnalysis);
};