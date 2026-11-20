import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the sign-in session lives on the phone: the Keychain (Keystore on
 * Android), not AsyncStorage.
 *
 * AsyncStorage is a plain file in the app's folder. It is readable from an
 * unencrypted device backup, and the session in it is a refresh token: whoever
 * holds it is signed in as that person, health log and all. The Keychain is
 * encrypted by the system and, as set below, never leaves this device.
 *
 * Three things shape the code:
 *
 *   * A Keychain value should stay under 2 KB and a session is larger, so it
 *     is stored in pieces. Pieces are written under a fresh slot and a small
 *     `meta` entry is switched to it last, so a read only ever sees a whole
 *     session, the old one or the new one.
 *   * People already signed in have their session in AsyncStorage. It is read
 *     from there once, moved across, and the plain copy deleted.
 *   * It must never be the reason somebody cannot sign in. If the Keychain
 *     refuses a write, the session is kept the old way and tried again next
 *     time, which is no worse than before this file existed.
 */

/** Characters per piece: under 2 KB even when every one takes three bytes. */
const PIECE = 600;
/** Pieces cleared on sign-out beyond the ones `meta` names, in case an older write left some. */
const SWEEP = 24;
const SLOTS = ['a', 'b'] as const;
type Slot = (typeof SLOTS)[number];

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable after the first unlock, so a refresh while the phone is locked
  // still works; "this device only", so it is not in backups or iCloud Keychain.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Set once the app has run on this install. AsyncStorage goes with the app; the Keychain does not. */
const INSTALLED_KEY = 'vitto.sessionStore.installed';

/** Keychain keys allow letters, digits, ".", "-" and "_" only. */
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const metaKey = (key: string) => `${safe(key)}.meta`;
const pieceKey = (key: string, slot: Slot, index: number) => `${safe(key)}.${slot}.${index}`;

const readMeta = async (key: string): Promise<{ slot: Slot; count: number } | null> => {
  const raw = await SecureStore.getItemAsync(metaKey(key), OPTIONS);
  const match = raw ? /^([ab]):(\d+)$/.exec(raw) : null;
  return match ? { slot: match[1] as Slot, count: Number(match[2]) } : null;
};

const secureRead = async (key: string): Promise<string | null> => {
  const meta = await readMeta(key);
  if (!meta) return null;
  const pieces = await Promise.all(
    Array.from({ length: meta.count }, (_, index) => SecureStore.getItemAsync(pieceKey(key, meta.slot, index), OPTIONS)),
  );
  // A missing piece means there is no whole session to return.
  return pieces.every((piece): piece is string => piece !== null) ? pieces.join('') : null;
};

const secureWrite = async (key: string, value: string): Promise<void> => {
  const current = await readMeta(key);
  const slot: Slot = current?.slot === 'a' ? 'b' : 'a';
  const count = Math.ceil(value.length / PIECE);
  for (let index = 0; index < count; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await SecureStore.setItemAsync(pieceKey(key, slot, index), value.slice(index * PIECE, (index + 1) * PIECE), OPTIONS);
  }
  // The switch: until this lands, readers still get the previous session whole.
  await SecureStore.setItemAsync(metaKey(key), `${slot}:${count}`, OPTIONS);
  if (current) {
    await Promise.all(
      Array.from({ length: current.count }, (_, index) =>
        SecureStore.deleteItemAsync(pieceKey(key, current.slot, index), OPTIONS).catch(() => undefined),
      ),
    );
  }
};

const secureRemove = async (key: string): Promise<void> => {
  const meta = await readMeta(key).catch(() => null);
  await SecureStore.deleteItemAsync(metaKey(key), OPTIONS);
  const upTo = Math.max(SWEEP, meta?.count ?? 0);
  await Promise.all(
    SLOTS.flatMap((slot) =>
      Array.from({ length: upTo }, (_, index) =>
        SecureStore.deleteItemAsync(pieceKey(key, slot, index), OPTIONS).catch(() => undefined),
      ),
    ),
  );
};

/** The three calls supabase-js makes on its session storage. */
export interface SessionStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/** A store of its own per call, so a test starts from a clean install. */
export const createSecureSessionStorage = (): SessionStorage => {
  /**
   * The Keychain outlives the app: delete Vitto and install it again and the
   * old session would still be there, signing whoever holds the phone back in.
   * A first run on this install therefore clears each key before using it.
   */
  const firstRun: Promise<boolean> = AsyncStorage.getItem(INSTALLED_KEY)
    .then((seen) => {
      if (seen !== null) return false;
      void AsyncStorage.setItem(INSTALLED_KEY, '1').catch(() => undefined);
      return true;
    })
    // Not knowing is treated as "not the first run": a wrong guess the other
    // way would sign somebody out.
    .catch(() => false);
  const settled = new Set<string>();
  const settle = async (key: string, clear: boolean) => {
    if (settled.has(key)) return;
    settled.add(key);
    if (clear && (await firstRun)) await secureRemove(key).catch(() => undefined);
  };

  return {
    async getItem(key) {
      // A plain copy is either a session from before this file, or one the
      // Keychain refused last time. Either way it is the newest: use it, and
      // move it across if the Keychain will take it now.
      const plain = await AsyncStorage.getItem(key);
      if (plain !== null) {
        settled.add(key);
        try {
          await secureWrite(key, plain);
          await AsyncStorage.removeItem(key);
        } catch {
          // Stays where it is; the next read tries again.
        }
        return plain;
      }
      await settle(key, true);
      try {
        return await secureRead(key);
      } catch {
        return null;
      }
    },

    async setItem(key, value) {
      await settle(key, false);
      try {
        await secureWrite(key, value);
        await AsyncStorage.removeItem(key);
      } catch (error) {
        console.warn('[session] the keychain refused the session; keeping it in app storage', error);
        await AsyncStorage.setItem(key, value);
      }
    },

    async removeItem(key) {
      settled.add(key);
      await AsyncStorage.removeItem(key);
      await secureRemove(key).catch(() => undefined);
    },
  };
};

/**
 * The app's session storage. The web build has no Keychain (expo-secure-store
 * is native only), so it keeps AsyncStorage, which there is the browser's own
 * storage, as it always was.
 */
export const sessionStorage: SessionStorage = Platform.OS === 'web' ? AsyncStorage : createSecureSessionStorage();
