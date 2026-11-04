import { MAX_PHONEMES, tokenize } from './tokens';

/**
 * The parts of running Kokoro that do not care where it runs: cutting a line
 * into pieces the model can take, the voice's style for each piece, and the
 * sound turned into a WAV file. The model call itself is handed in, so the
 * same code runs on the phone (onnxruntime-react-native) and in tests.
 */

export const SAMPLE_RATE = 24000;
/** A voice file is 510 style vectors of 256 floats, one per phoneme count. */
const STYLE_SIZE = 256;

/** Runs the model once: token ids, a style, a speed -> samples at 24 kHz. */
export type RunKokoro = (ids: number[], style: Float32Array, speed: number) => Promise<Float32Array>;

/**
 * Phonemes in pieces of at most `MAX_PHONEMES`, cut after a sentence where
 * possible, then after a clause, then between words.
 */
export const chunkPhonemes = (phonemes: string, limit = MAX_PHONEMES): string[] => {
  const sentences = phonemes.match(/[^.!?…]+[.!?…]*\s*/g) ?? [];
  const chunks: string[] = [];
  let current = '';
  const push = (piece: string) => {
    if ((current + piece).length <= limit) {
      current += piece;
      return;
    }
    if (current.trim()) chunks.push(current.trim());
    current = '';
    if (piece.length <= limit) {
      current = piece;
      return;
    }
    // One sentence too long on its own: by clause, then by word.
    for (const part of piece.match(/[^,;:—]+[,;:—]?\s*/g) ?? []) {
      if ((current + part).length <= limit) {
        current += part;
        continue;
      }
      if (current.trim()) chunks.push(current.trim());
      current = '';
      for (const word of part.split(' ')) {
        if ((current + word).length + 1 > limit && current.trim()) {
          chunks.push(current.trim());
          current = '';
        }
        current += `${word} `;
      }
    }
  };
  for (const sentence of sentences) push(sentence);
  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

/** The voice's style vector for a piece this many phonemes long. */
export const styleFor = (voice: Float32Array, phonemeCount: number): Float32Array => {
  const rows = voice.length / STYLE_SIZE;
  const row = Math.min(Math.max(phonemeCount, 0), rows - 1);
  return voice.subarray(row * STYLE_SIZE, (row + 1) * STYLE_SIZE);
};

/** Each piece of the line, as samples, one after another. */
export async function* synthesize(phonemes: string, voice: Float32Array, run: RunKokoro, speed = 1): AsyncGenerator<Float32Array> {
  for (const chunk of chunkPhonemes(phonemes)) {
    const ids = tokenize(chunk);
    yield await run(ids, styleFor(voice, ids.length - 2), speed);
  }
}

/** Joins pieces, with a short breath between them. */
export const joinSamples = (pieces: readonly Float32Array[], gapSeconds = 0.12): Float32Array => {
  const gap = Math.round(gapSeconds * SAMPLE_RATE);
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0) + gap * Math.max(pieces.length - 1, 0);
  const out = new Float32Array(total);
  let at = 0;
  pieces.forEach((piece, index) => {
    out.set(piece, at);
    at += piece.length + (index < pieces.length - 1 ? gap : 0);
  });
  return out;
};

/**
 * 16-bit mono WAV. `playbackRate` above 1 writes a higher sample rate into the
 * header than the sound was made at, so it plays faster and higher: the pet's
 * small-animal voice, without any pitch-shifting maths.
 */
export const encodeWav = (samples: Float32Array, playbackRate = 1): Uint8Array => {
  const rate = Math.round(SAMPLE_RATE * playbackRate);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
};
