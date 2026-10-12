import { type MealAnalysis, type MealPetContext, parseMealAnalysisResponse } from '@vitto/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabaseClient';

export interface PickedImage {
  /** Local file URI, used for the on-screen preview. */
  uri: string;
  /** Image bytes, requested from the picker so no file read is needed. */
  base64: string;
  mimeType?: string;
}

/**
 * The longest side a meal photo is sent at. Plenty to judge a plate by, and a
 * fraction of a phone camera's 4,000 px: a smaller upload is quicker, fails
 * less often on a poor connection, and costs less to read (the model is billed
 * by image size, and scales anything much larger than this down anyway).
 */
export const UPLOAD_MAX_SIDE = 1024;

/**
 * The picked photo, shrunk to {@link UPLOAD_MAX_SIDE} on its longest side and
 * re-encoded as JPEG. One already that small is only re-encoded. If the phone
 * cannot do it, the picker's own bytes are sent as they are: a bigger upload
 * beats no analysis.
 */
export const shrinkForUpload = async (asset: {
  uri: string;
  base64: string;
  mimeType?: string;
  width?: number;
  height?: number;
}): Promise<PickedImage> => {
  const original: PickedImage = { uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const width = asset.width ?? 0;
    const height = asset.height ?? 0;
    if (Math.max(width, height) > UPLOAD_MAX_SIDE) {
      context.resize(width >= height ? { width: UPLOAD_MAX_SIDE } : { height: UPLOAD_MAX_SIDE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
    return saved.base64 ? { uri: asset.uri, base64: saved.base64, mimeType: 'image/jpeg' } : original;
  } catch {
    return original;
  }
};

/** A request that never got an answer: no connection, or the connection broke mid-upload. */
const isNetworkFailure = (error: unknown): boolean =>
  (error as { name?: string } | null)?.name === 'FunctionsFetchError';

/** How long to wait before the one retry of a photo whose upload broke. */
const RETRY_DELAY_MS = 800;

/**
 * The photo goes to `analyze-meal` in the request itself and is never stored:
 * not uploaded to a bucket, not kept by the function. Only the analysis is.
 * The picker returns the bytes itself (`base64: true`), which avoids reading
 * the file back off disk.
 *
 * `pet` is optional and only ever adds: with it, the function also returns the
 * pet's reaction to the plate in its own voice. Without it (the web app, tests)
 * the analysis is exactly what it always was.
 */
export const analyzeMealImage = async (image: PickedImage, pet?: MealPetContext): Promise<MealAnalysis> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before analyzing a meal.');

  if (!image.base64) throw new Error('That photo could not be read. Try choosing it again.');
  const send = () =>
    supabase!.functions.invoke('analyze-meal', {
      body: { image: { base64: image.base64, mimeType: image.mimeType ?? 'image/jpeg' }, ...(pet ? { pet } : {}) },
    });
  let { data, error } = await send();
  // A broken upload is retried once: on a patchy connection the second usually
  // lands. Only a request that never got an answer; a server's "no" stands.
  if (error && isNetworkFailure(error)) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    ({ data, error } = await send());
    if (error && isNetworkFailure(error)) {
      throw new Error("Couldn't reach Vitto to read your plate. Check your connection and try again.");
    }
  }
  if (error) {
    // supabase-js hangs the failed Response off `context`, and the function puts the
    // real reason in its JSON body. Duck-typed rather than `instanceof Response`:
    // React Native's fetch polyfill defines its own Response class, so an identity
    // check fails on device and buries every server error under the useless
    // "Edge Function returned a non-2xx status code".
    const context = (error as { context?: unknown }).context;
    const body =
      context && typeof (context as Response).text === 'function' ? (context as Response) : null;
    if (body) {
      const raw = await body.text().catch(() => '');
      if (raw) {
        let detail = raw;
        try {
          detail = ((JSON.parse(raw) as { error?: string }).error ?? raw).trim();
        } catch {
          // Not JSON — a gateway or runtime error page. Its text is still the
          // most specific thing we have, so pass it through as-is.
        }
        if (detail === 'PLUS_REQUIRED') throw new Error('Photo meal tracking is part of Vitto Plus. Search or scan a barcode instead.');
        if (detail) throw new Error(detail);
      }
    }
    throw error;
  }
  return parseMealAnalysisResponse(data);
};
