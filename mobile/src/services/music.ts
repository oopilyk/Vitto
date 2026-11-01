import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * The background music: the lo-fi tracks in assets/music, one after another,
 * starting from a random one so every open does not begin the same way.
 *
 * Kept quiet and polite on purpose. It plays under whatever else is on (a
 * podcast, the person's own music) instead of stopping it, it obeys the silent
 * switch, and it stops when the app leaves the screen: Vitto is not a music
 * player, and no background-audio mode is asked of iOS for it.
 */
const TRACKS: number[] = [
  require('../../assets/music/lofi-1.m4a'),
  require('../../assets/music/lofi-2.m4a'),
  require('../../assets/music/lofi-3.m4a'),
  require('../../assets/music/lofi-4.m4a'),
  require('../../assets/music/lofi-5.m4a'),
  require('../../assets/music/lofi-6.m4a'),
  require('../../assets/music/lofi-7.m4a'),
];

const STORAGE_KEY = 'vitto.music';
/** Background, not foreground: under the pet's sounds and the person's own audio. */
const VOLUME = 0.35;

let player: AudioPlayer | null = null;
let track = 0;
let playing = false;

/** On unless turned off. */
export const loadMusicEnabled = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) !== 'off';
  } catch {
    return true;
  }
};

export const saveMusicEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // The switch still applies for this session; it just will not survive a restart.
  }
};

/** The player, made once: the session set up and the next track queued on each ending. */
const ensurePlayer = async (): Promise<AudioPlayer> => {
  if (player) return player;
  await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
  track = Math.floor(Math.random() * TRACKS.length);
  const created = createAudioPlayer(TRACKS[track]);
  created.volume = VOLUME;
  created.addListener('playbackStatusUpdate', (status) => {
    if (!status.didJustFinish) return;
    track = (track + 1) % TRACKS.length;
    created.replace(TRACKS[track]);
    if (playing) created.play();
  });
  player = created;
  return created;
};

/** Starts the music, or resumes it where it stopped. Quietly does nothing where audio cannot play. */
export const playMusic = async (): Promise<void> => {
  playing = true;
  try {
    const current = await ensurePlayer();
    // Turned off again while the player was being made.
    if (playing) current.play();
  } catch (error) {
    console.warn('[music] could not play', error);
  }
};

/** Pauses it, keeping the place for the next `playMusic`. */
export const pauseMusic = (): void => {
  playing = false;
  try {
    player?.pause();
  } catch {
    // Nothing playing to pause.
  }
};
