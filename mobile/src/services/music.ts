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

/** Under other audio, quiet on silent, never in the background. */
const setSession = () => setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });

/** The player, made once: the session set up and the next track queued on each ending. */
const ensurePlayer = async (): Promise<AudioPlayer> => {
  if (player) return player;
  await setSession();
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

/** Checks after a play that it took, this many times, this far apart. */
const PLAY_CHECKS = 4;
const PLAY_CHECK_MS = 600;
let checking: ReturnType<typeof setTimeout> | null = null;

/**
 * Asks again until the player is really playing. In the first moments of a
 * launch iOS can refuse to start the audio session, and `play()` fails
 * without a word -- the music then stayed silent until something else
 * restarted it.
 */
const confirmPlaying = (current: AudioPlayer, left: number) => {
  if (checking) clearTimeout(checking);
  checking = setTimeout(() => {
    checking = null;
    if (!playing || current.playing || left <= 0) return;
    void setSession()
      .catch(() => undefined)
      .then(() => {
        if (!playing) return;
        current.play();
        confirmPlaying(current, left - 1);
      });
  }, PLAY_CHECK_MS);
};

/** Starts the music, or resumes it where it stopped. Quietly does nothing where audio cannot play. */
export const playMusic = async (): Promise<void> => {
  playing = true;
  try {
    const current = await ensurePlayer();
    // Turned off again while the player was being made.
    if (!playing) return;
    current.play();
    confirmPlaying(current, PLAY_CHECKS);
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

/** Paused for the mic (see PetMicButton), to come back after. */
let held = false;

/** Stops the music while someone talks to the pet, so the mic hears them, not it. */
export const holdMusic = (): void => {
  held = playing;
  pauseMusic();
};

/**
 * After talking: the speech recogniser leaves iOS set up for recording, which
 * plays quietly through the earpiece, so the music's own setup is put back
 * before it carries on.
 */
export const releaseMusic = async (): Promise<void> => {
  if (!held) return;
  held = false;
  try {
    await setSession();
  } catch {
    // Plays on whatever setup there is.
  }
  await playMusic();
};
