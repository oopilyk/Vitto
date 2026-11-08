import { phonemize, parseLexicon, soundOut } from '../voice/g2p';
import { normalizeForSpeech, numberToWords } from '../voice/normalize';
import { chunkPhonemes, encodeWav, SAMPLE_RATE, styleFor, trimSilence } from '../voice/synth';
import { tokenize } from '../voice/tokens';
import { isPetVoice, PET_VOICES } from '@vitto/core';
import { playbackRateFor, voiceOf, VOICE_STYLES } from '../services/petVoice';

/** A few entries in the real lexicon's format and phonemes (misaki us_gold). */
const lexicon = parseLexicon(['hi\thˈI', 'lift\tlˈɪft', 'run\tɹˈʌn', 'gym\tʤˈɪm', 'bro\tbɹˈO', 'nice\tnˈIs', 'set\tsˈɛt', 'apple\tˈæpᵊl', 'pounds\tpˈWndz'].join('\n'));

describe('pet voice: text to speech', () => {
  it('cuts the long silence Kokoro leaves after a sentence, keeping a short fade', () => {
    const speech = new Float32Array(SAMPLE_RATE).fill(0.3);
    const piece = new Float32Array(SAMPLE_RATE * 2);
    piece.set(speech, SAMPLE_RATE / 4); // 0.25 s before, 0.75 s after
    const trimmed = trimSilence(piece);
    expect(trimmed.length).toBe(SAMPLE_RATE + Math.round(0.02 * SAMPLE_RATE) + Math.round(0.05 * SAMPLE_RATE));
    expect(trimSilence(new Float32Array(100)).length).toBe(100);
  });

  it('says numbers, units and sets the way a person would', () => {
    expect(numberToWords(2205)).toBe('two thousand two hundred five');
    expect(normalizeForSpeech('225x8')).toBe('two hundred twenty-five for eight');
    expect(normalizeForSpeech('1,900 kcal')).toBe('one thousand nine hundred calories');
    expect(normalizeForSpeech('at 7:05')).toBe('at seven oh five');
    expect(normalizeForSpeech('*wags tail* Nice! 💪')).toBe('Nice!');
  });

  it('reads words from the lexicon, and works out their inflections and compounds', () => {
    expect(phonemize('Hi, nice set!', lexicon)).toBe('hˈI, nˈIs sˈɛt!');
    expect(phonemize('lifted', lexicon)).toBe('lˈɪftᵻd');
    expect(phonemize('running', lexicon)).toBe('ɹˈʌnɪŋ');
    expect(phonemize('gymbro', lexicon)).toBe('ʤˈɪmbɹˌO');
  });

  it('says the little words weak, and "the" as "thee" before a vowel', () => {
    expect(phonemize('a set', lexicon)).toBe('ɐ sˈɛt');
    expect(phonemize('the apple', lexicon)).toBe('ði ˈæpᵊl');
  });

  it('sounds out a word it has never seen rather than skipping it', () => {
    expect(soundOut('Zork')).toBe('zˈɔɹk');
  });

  it('says a sentence per piece, with a short first one so the voice starts quickly', () => {
    expect(chunkPhonemes('hˈI! hˌW ɑɹ ju? ˈIm ɡˈʊd.')).toEqual(['hˈI!', 'hˌW ɑɹ ju?', 'ˈIm ɡˈʊd.']);
    const longFirst = 'ˈO, ænd tˈu hˈʌndɹəd twˈɛnti fˈIv fɔɹ ˈAt ˌɔn bˈɛnʧ, ðæts hjˈuʤ ænd ˈɔsəm? jˈɛs.';
    const [first, ...rest] = chunkPhonemes(longFirst);
    expect(first.length).toBeLessThanOrEqual(60);
    expect(first.endsWith(',')).toBe(true);
    expect(rest.at(-1)).toBe('jˈɛs.');
  });

  it('copies the style row rather than viewing it (the phone ignores a view\'s offset)', () => {
    const voice = new Float32Array(510 * 256).map((_, i) => i);
    const style = styleFor(voice, 3);
    expect(style.byteOffset).toBe(0);
    expect(style.buffer).not.toBe(voice.buffer);
  });

  it('pads token ids and keeps each piece within what the model takes', () => {
    expect(tokenize('hˈI!')).toEqual([0, 50, 156, 25, 5, 0]);
    const long = Array.from({ length: 80 }, () => 'hˈI ðˈɛɹ.').join(' ');
    const chunks = chunkPhonemes(long, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });

  it('picks the style for the piece length, and writes a playable WAV', () => {
    const voice = new Float32Array(510 * 256).map((_, i) => i);
    expect(styleFor(voice, 3)[0]).toBe(3 * 256);
    const wav = encodeWav(new Float32Array([0, 1, -1]), 1.25);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(30000);
    expect(wav.length).toBe(44 + 6);
  });

  it('gives each pet its own raised pitch, the same every time', () => {
    const a = playbackRateFor('pet-a');
    expect(a).toBeGreaterThanOrEqual(1.1);
    expect(a).toBeLessThanOrEqual(1.22);
    expect(playbackRateFor('pet-a')).toBe(a);
    expect(playbackRateFor('pet-b')).not.toBe(a);
  });

  it('speaks in the voice picked for the pet, or one from its id the same every time', () => {
    expect(voiceOf({ id: 'pet-a', voice: 'male' })).toBe('male');
    expect(voiceOf({ id: 'pet-a', voice: 'female' })).toBe('female');
    expect(voiceOf({ id: 'pet-a' })).toBe(voiceOf({ id: 'pet-a' }));
    const picks = new Set(Array.from({ length: 20 }, (_, i) => voiceOf({ id: `pet-${i}` })));
    expect(picks).toEqual(new Set(['female', 'male']));
    expect(voiceOf({ id: 'pet-a', voice: 'santa' })).toBe('santa');
  });

  it('has a style for every voice, deep below a normal pitch and squeaky above', () => {
    for (const voice of PET_VOICES) expect(VOICE_STYLES[voice].label).toBeTruthy();
    expect(VOICE_STYLES.deep.playbackRate).toBeLessThan(1);
    expect(VOICE_STYLES['squeaky-female'].playbackRate).toBeGreaterThan(1.22);
    expect(VOICE_STYLES['squeaky-male'].kokoro).toBe('am_puck');
    // Fast keeps the pet's own pitch and just talks faster.
    expect(VOICE_STYLES['fast-female'].playbackRate).toBeUndefined();
    expect(VOICE_STYLES['fast-female'].speed).toBeGreaterThan(VOICE_STYLES.female.speed);
  });

  it('reads only voices it knows from the database', () => {
    expect(isPetVoice('squeaky-male')).toBe(true);
    expect(isPetVoice('robot')).toBe(false);
    expect(isPetVoice(null)).toBe(false);
  });
});
