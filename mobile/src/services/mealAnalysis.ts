import { decode } from 'base64-arraybuffer';
import { type MealAnalysis, newId, parseMealAnalysisResponse } from '@vitto/core';
import { supabase } from './supabaseClient';

const bucket = 'meal-images';

export interface PickedImage {
  /** Local file URI, used for the on-screen preview. */
  uri: string;
  /** Image bytes, requested from the picker so no file read is needed. */
  base64: string;
  mimeType?: string;
}

/**
 * The web build handed Supabase a File straight from an <input>. On device the
 * picker returns the bytes itself (`base64: true`), which avoids reading the file
 * back off disk: expo-file-system's modern `File` API needs native code that is not
 * in every Expo Go build, and its legacy reader is deprecated.
 */
export const analyzeMealImage = async (image: PickedImage): Promise<MealAnalysis> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before analyzing a meal.');

  const contentType = image.mimeType ?? 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${user.id}/${newId()}.${extension}`;

  if (!image.base64) throw new Error('That photo could not be read. Try choosing it again.');
  const bytes = decode(image.base64);
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { storagePath: path },
  });
  if (error) {
    const response = 'context' in error && error.context instanceof Response ? error.context : null;
    if (response) {
      try {
        const details = (await response.json()) as { error?: string };
        throw new Error(details.error || error.message);
      } catch (cause) {
        if (cause instanceof Error && cause.message !== error.message) throw cause;
      }
    }
    throw error;
  }
  return parseMealAnalysisResponse(data);
};
