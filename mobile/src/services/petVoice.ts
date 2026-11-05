import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { PetState, PetVoice } from '@vitto/core';
import { deleteModel, downloadModel, isModelDownloaded, speakToFiles, warmUp, type KokoroVoice } from '../voice/kokoro';
import { duckMusic, setQuietAudioSession } from './music';

/**
 * The pet's voice: what it says in the room's bubble, said out loud by Kokoro
 * running on the phone (see voice/kokoro.ts), pitched up into a small
 * animal's voice. Off until switched on, since switching it on downloads the
 * model (86 MB, once).
 *
 * It shares the music's audio setup, so it mixes under other audio and is
 * quiet on silent, and the music dips while the pet talks.
 */

const STORAGE_KEY = 'vitto.petVoice';

/** Off unless turned on: turning it on is a download. */
export const loadVoiceEnabled = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'on';
  } catch {
    return false;
  }
};

export const saveVoiceEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // The switch still applies for this session; it just will not survive a restart.
  }
};

export { isModelDownloaded as isVoiceReady, MODEL_BYTES as VOICE_DOWNLOAD_BYTES } from '../voice/kokoro';

/** Gets the voice ready: downloads the model if it is not here yet, then loads it. */
export const prepareVoice = async (onProgress?: (fraction: number) => void, pet?: Pick<PetState, 'id' | 'voice'>): Promise<void> => {
  await downloadModel(onProgress);
  if (pet) warmUpVoice(pet);
  else warmUp();
};

/** Switched off: the model is deleted, so it does not sit in 86 MB of their storage. */
export const discardVoice = (): void => {
  stopPetVoice();
  deleteModel();
};

/** Each pet gets its own pitch in this range, from its id, so two pets do not sound alike. */
const RATE_LOW = 1.1;
const RATE_HIGH = 1.22;
/** Spoken a little slow, since playing it back faster to raise the pitch speeds it up again. */
const SPEED = 0.9;

const hashOf = (petId: string) => {
  let hash = 0;
  for (let i = 0; i < petId.length; i += 1) hash = (hash * 31 + petId.charCodeAt(i)) >>> 0;
  return hash;
};

export const playbackRateFor = (petId: string): number => RATE_LOW + ((hashOf(petId) % 1000) / 1000) * (RATE_HIGH - RATE_LOW);

/**
 * What each voice is made of. `speed` is how fast Kokoro speaks it;
 * `playbackRate` is how much faster it is then played, which raises the pitch
 * and the pace together (below 1 lowers both) -- so a voice played fast is
 * spoken slowly to keep its words at a talking pace, and the other way round.
 * Absent `playbackRate`: the pet's own, from its id. Tuned by ear on Mac.
 */
export const VOICE_STYLES: Record<PetVoice, { label: string; kokoro: KokoroVoice; speed: number; playbackRate?: number }> = {
  female: { label: 'Girl', kokoro: 'af_heart', speed: SPEED },
  male: { label: 'Boy', kokoro: 'am_puck', speed: SPEED },
  // ~80 Hz, against ~140 Hz for Boy.
  deep: { label: 'Super deep', kokoro: 'am_onyx', speed: 1.2, playbackRate: 0.76 },
  'squeaky-female': { label: 'Squeaky girl', kokoro: 'af_heart', speed: 0.7, playbackRate: 1.6 },
  'squeaky-male': { label: 'Squeaky boy', kokoro: 'am_puck', speed: 0.7, playbackRate: 1.6 },
  'fast-female': { label: 'Speedy girl', kokoro: 'af_heart', speed: 1.45 },
  'fast-male': { label: 'Speedy boy', kokoro: 'am_puck', speed: 1.45 },
  // Santa as he is: pitching him up would make him an elf.
  santa: { label: 'Santa', kokoro: 'am_santa', speed: 0.95, playbackRate: 1 },
};

/** The voice picked for it, or else Girl or Boy from its id: the same on every phone, about half each way. */
export const voiceOf = (pet: Pick<PetState, 'id' | 'voice'>): PetVoice => pet.voice ?? (hashOf(pet.id) % 2 === 0 ? 'female' : 'male');

/** Loads this pet's voice ahead of its first line. */
export const warmUpVoice = (pet: Pick<PetState, 'id' | 'voice'>): void => warmUp(VOICE_STYLES[voiceOf(pet)].kokoro);

/** Which line is being said; a newer one, or a stop, ends the older. */
let generation = 0;
let finishClip: (() => void) | null = null;

/** Plays one file to its end, or until stopped. */
const playClip = (uri: string) =>
  new Promise<void>((resolve) => {
    const player: AudioPlayer = createAudioPlayer(uri);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      subscription.remove();
      try {
        player.remove();
      } catch {
        // Already gone.
      }
      if (finishClip === finish) finishClip = null;
      resolve();
    };
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    finishClip = finish;
    player.play();
  });

/** Says it in this pet's voice, cutting off whatever it was saying before. Quietly nothing when the voice is not downloaded. */
export const speakAsPet = async (text: string, pet: Pick<PetState, 'id' | 'voice'>): Promise<void> => {
  if (!isModelDownloaded()) return;
  stopPetVoice();
  const mine = ++generation;
  const isCurrent = () => mine === generation;
  try {
    await setQuietAudioSession();
    const style = VOICE_STYLES[voiceOf(pet)];
    const clips = speakToFiles(text, { voice: style.kokoro, speed: style.speed, playbackRate: style.playbackRate ?? playbackRateFor(pet.id), isCurrent });
    let next = clips.next();
    for (;;) {
      const { value, done } = await next;
      if (done || !isCurrent()) break;
      // The next sentence is worked out while this one plays.
      next = clips.next();
      duckMusic(true);
      await playClip(value.uri);
      if (!isCurrent()) break;
    }
  } catch (error) {
    console.warn('[petVoice] could not speak', error);
  } finally {
    if (isCurrent()) duckMusic(false);
  }
};

export const stopPetVoice = (): void => {
  generation += 1;
  finishClip?.();
  duckMusic(false);
};
