import type { PetVoice } from '@vitto/core';
import type { File } from 'expo-file-system';

/**
 * The web build has no voice. onnxruntime-react-native is native only (it
 * throws the moment it is imported in a browser), so the web gets this
 * instead of kokoro.ts: the model is never there, and nothing is ever said.
 * Settings hides the switch on the web too.
 */

export const MODEL_BYTES = 86033585;

export const isModelDownloaded = (): boolean => false;

export const downloadModel = (_onProgress?: (fraction: number) => void): Promise<void> =>
  Promise.reject(new Error('The pet’s voice is only in the app.'));

export const deleteModel = (): void => {};

export const warmUp = (): void => {};

export async function* speakToFiles(
  _text: string,
  _options: { voice: PetVoice; speed: number; playbackRate: number; isCurrent: () => boolean },
): AsyncGenerator<File> {}
