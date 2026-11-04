import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { PetVoice } from '@vitto/core';
import { parseLexicon, phonemize, type Lexicon } from './g2p';
import { encodeWav, joinSamples, synthesize, type RunKokoro } from './synth';

/**
 * Kokoro (hexgrad/Kokoro-82M, Apache-2.0) on the phone.
 *
 * The model is the smallest published build -- 8-bit weights, 16-bit
 * activations, 86 MB -- and is downloaded once, when the voice is first turned
 * on, rather than shipped in the app. The lexicon (4 MB of text, ~1 MB in the
 * App Store download) and the two voices (fp16, 255 KB each) ship with the app.
 * Nothing leaves the phone to speak: no server, no per-line cost.
 */

/** Pinned to one commit, so the file never changes under the app. */
const MODEL_URL =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231/onnx/model_q8f16.onnx';
/** Its exact size: a download that stopped short is not a model. */
export const MODEL_BYTES = 86033585;

const folder = () => new Directory(Paths.document, 'kokoro');
const modelFile = () => new File(folder(), 'model_q8f16.onnx');

/** onnxruntime wants a plain path, not a file:// URI. */
const pathOf = (file: File) => decodeURIComponent(file.uri.replace(/^file:\/\//, ''));

export const isModelDownloaded = (): boolean => {
  try {
    const file = modelFile();
    return file.exists && file.size === MODEL_BYTES;
  } catch {
    return false;
  }
};

let downloading: Promise<void> | null = null;

/** Downloads the model, reporting 0-1 as it goes. Safe to call twice: the second waits on the first. */
export const downloadModel = (onProgress?: (fraction: number) => void): Promise<void> => {
  if (isModelDownloaded()) return Promise.resolve();
  downloading ??= (async () => {
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true });
    const partial = new File(dir, 'model.partial');
    if (partial.exists) partial.delete();
    await File.downloadFileAsync(MODEL_URL, partial, {
      idempotent: true,
      onProgress: ({ bytesWritten }) => onProgress?.(Math.min(bytesWritten / MODEL_BYTES, 1)),
    });
    if (partial.size !== MODEL_BYTES) {
      partial.delete();
      throw new Error('The voice download did not finish. Try again on Wi-Fi.');
    }
    const target = modelFile();
    if (target.exists) target.delete();
    await partial.move(target);
  })().finally(() => {
    downloading = null;
  });
  return downloading;
};

/** Removes the downloaded model, for the switch going off. */
export const deleteModel = (): void => {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing there.
  }
  session = null;
};

/** fp16 to fp32: the voice ships at half size, the model wants floats. */
const halfToFloat = (bytes: Uint8Array): Float32Array => {
  const halves = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const out = new Float32Array(halves.length);
  for (let i = 0; i < halves.length; i += 1) {
    const h = halves[i];
    const sign = h & 0x8000 ? -1 : 1;
    const exponent = (h >> 10) & 0x1f;
    const fraction = h & 0x3ff;
    out[i] =
      exponent === 0
        ? sign * 2 ** -14 * (fraction / 1024)
        : exponent === 31
          ? fraction ? NaN : sign * Infinity
          : sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  }
  return out;
};

const readAsset = async (module: number): Promise<File> => {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri);
};

/** Kokoro's voices for each: af_heart, its best-rated, and am_puck, light enough for a small animal. */
const voiceFile = (voice: PetVoice): number =>
  voice === 'male' ? require('../../assets/voice-am_puck.f16.bin') : require('../../assets/voice-af_heart.f16.bin');

interface Engine {
  run: RunKokoro;
  lexicon: Lexicon;
}

let session: Promise<Engine> | null = null;

/** The model, lexicon and voice, loaded once and kept. */
const engine = (): Promise<Engine> => {
  session ??= (async () => {
    const [model, lexiconFile] = await Promise.all([
      InferenceSession.create(pathOf(modelFile()), { intraOpNumThreads: 1 }),
      readAsset(require('../../assets/voice-lexicon.txt')),
    ]);
    const lexiconText = await lexiconFile.text();
    const run: RunKokoro = async (ids, style, speed) => {
      const out = await model.run({
        input_ids: new Tensor('int64', BigInt64Array.from(ids, (id) => BigInt(id)), [1, ids.length]),
        style: new Tensor('float32', style, [1, style.length]),
        speed: new Tensor('float32', new Float32Array([speed]), [1]),
      });
      return out.waveform.data as Float32Array;
    };
    return { run, lexicon: parseLexicon(lexiconText) };
  })().catch((error: unknown) => {
    session = null;
    throw error;
  });
  return session;
};

const voices = new Map<PetVoice, Promise<Float32Array>>();

/** A voice's style vectors, read once. */
const voiceData = (voice: PetVoice): Promise<Float32Array> => {
  let data = voices.get(voice);
  if (!data) {
    data = readAsset(voiceFile(voice))
      .then((file) => file.bytes())
      .then(halfToFloat)
      .catch((error: unknown) => {
        voices.delete(voice);
        throw error;
      });
    voices.set(voice, data);
  }
  return data;
};

/** Loads it ahead of the first line, so that one is not slow. */
export const warmUp = (): void => {
  if (isModelDownloaded()) void engine().catch(() => undefined);
};

let clip = 0;

/**
 * The line as WAV files, one per sentence, each handed over as soon as it is
 * made so the first can play while the rest are still being worked out.
 * `isCurrent` going false stops it between sentences.
 */
export async function* speakToFiles(
  text: string,
  { voice: who, speed, playbackRate, isCurrent }: { voice: PetVoice; speed: number; playbackRate: number; isCurrent: () => boolean },
): AsyncGenerator<File> {
  const [{ run, lexicon }, voice] = await Promise.all([engine(), voiceData(who)]);
  const phonemes = phonemize(text, lexicon);
  if (!phonemes) return;
  const dir = new Directory(Paths.cache, 'kokoro');
  if (!dir.exists) dir.create({ intermediates: true });
  for await (const samples of synthesize(phonemes, voice, run, speed)) {
    if (!isCurrent()) return;
    const file = new File(dir, `line-${(clip = (clip + 1) % 8)}.wav`);
    if (file.exists) file.delete();
    file.create();
    // A short tail of silence, so the end of a word is not clipped.
    file.write(encodeWav(joinSamples([samples, new Float32Array(2400)], 0), playbackRate));
    yield file;
  }
}
