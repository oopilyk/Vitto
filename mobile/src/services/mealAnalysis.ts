import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { type MealAnalysis, newId, withEstimatedCalories } from '@vitto/core';
import { supabase } from './supabaseClient';

const bucket = 'meal-images';

export interface PickedImage {
  uri: string;
  mimeType?: string;
  fileName?: string;
}

/**
 * The web build handed Supabase a File straight from an <input>. On device the
 * picker gives a file:// URI, so the bytes are read as base64 and decoded into an
 * ArrayBuffer, which the storage client accepts.
 */
export const analyzeMealImage = async (image: PickedImage): Promise<MealAnalysis> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before analyzing a meal.');

  const contentType = image.mimeType ?? 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${user.id}/${newId()}.${extension}`;

  const base64 = await FileSystem.readAsStringAsync(image.uri, { encoding: 'base64' });
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, decode(base64), { contentType, upsert: false });
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
  return withEstimatedCalories(data.analysis as MealAnalysis);
};
