import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createSecureSessionStorage } from '../services/secureSessionStorage';

const KEY = 'sb-project-auth-token';
/** A session-sized value: several keychain pieces, with characters that take more than one byte. */
const session = (tag: string) => JSON.stringify({ tag, access_token: 'x'.repeat(1500), name: 'Zoë 🐇', refresh_token: 'r'.repeat(40) });

const keychain = (SecureStore as unknown as { __items: Map<string, string> }).__items;
/** A store on an install that has already run once, as almost every launch is. */
const settledStore = async () => {
  await AsyncStorage.setItem('vitto.sessionStore.installed', '1');
  return createSecureSessionStorage();
};

beforeEach(async () => {
  keychain.clear();
  await AsyncStorage.clear();
  // A working keychain again, whatever the test before did to it.
  (SecureStore.getItemAsync as jest.Mock).mockReset().mockImplementation(async (key: string) => keychain.get(key) ?? null);
  (SecureStore.setItemAsync as jest.Mock).mockReset().mockImplementation(async (key: string, value: string) => {
    keychain.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockReset().mockImplementation(async (key: string) => {
    keychain.delete(key);
  });
});

describe('the sign-in session on the phone', () => {
  it('keeps the session in the keychain, in pieces, and nothing in app storage', async () => {
    const store = await settledStore();
    await store.setItem(KEY, session('one'));
    expect(await store.getItem(KEY)).toBe(session('one'));
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect([...keychain.values()].every((piece) => piece.length <= 600)).toBe(true);
    expect(keychain.size).toBeGreaterThan(2);
  });

  it('returns the newest session after a refresh, however the sizes compare', async () => {
    const store = await settledStore();
    await store.setItem(KEY, session('long') + 'y'.repeat(2000));
    await store.setItem(KEY, session('short'));
    expect(await store.getItem(KEY)).toBe(session('short'));
    await store.setItem(KEY, session('long again') + 'z'.repeat(3000));
    expect(await store.getItem(KEY)).toBe(session('long again') + 'z'.repeat(3000));
  });

  it('moves a session from before the keychain across, and deletes the plain copy', async () => {
    await AsyncStorage.setItem(KEY, session('legacy'));
    const store = createSecureSessionStorage();
    // Still signed in on the very first read after the update.
    expect(await store.getItem(KEY)).toBe(session('legacy'));
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await createSecureSessionStorage().getItem(KEY)).toBe(session('legacy'));
  });

  it('keeps the session the old way if the keychain refuses it, and moves it once it can', async () => {
    const store = await settledStore();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('keychain unavailable'));
    await store.setItem(KEY, session('fallback'));
    expect(await store.getItem(KEY)).toBe(session('fallback'));
    expect(await AsyncStorage.getItem(KEY)).toBe(session('fallback'));

    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      keychain.set(key, value);
    });
    expect(await store.getItem(KEY)).toBe(session('fallback'));
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await store.getItem(KEY)).toBe(session('fallback'));
    warn.mockRestore();
  });

  it('a refused write never leaves an older keychain session to be read instead', async () => {
    const store = await settledStore();
    await store.setItem(KEY, session('old'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('keychain unavailable'));
    await store.setItem(KEY, session('new'));
    expect(await store.getItem(KEY)).toBe(session('new'));
    warn.mockRestore();
  });

  it('signing out clears the keychain and app storage', async () => {
    const store = await settledStore();
    await store.setItem(KEY, session('one'));
    await store.removeItem(KEY);
    expect(await store.getItem(KEY)).toBeNull();
    expect([...keychain.keys()].filter((key) => key.startsWith(KEY))).toEqual([]);
  });

  it('a reinstall does not sign back in from a keychain the last install left behind', async () => {
    const before = await settledStore();
    await before.setItem(KEY, session('previous install'));
    // Deleting the app clears its storage; the keychain stays.
    await AsyncStorage.clear();
    const after = createSecureSessionStorage();
    expect(await after.getItem(KEY)).toBeNull();
    // And from then on it is an ordinary install.
    await after.setItem(KEY, session('fresh'));
    expect(await createSecureSessionStorage().getItem(KEY)).toBe(session('fresh'));
  });

  it('signing in on a first run is not undone by the first-run clear', async () => {
    const store = createSecureSessionStorage();
    await store.setItem(KEY, session('just signed in'));
    expect(await store.getItem(KEY)).toBe(session('just signed in'));
  });

  it('reads as signed out, not as an error, if the keychain cannot be read', async () => {
    const store = await settledStore();
    await store.setItem(KEY, session('one'));
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    expect(await store.getItem(KEY)).toBeNull();
  });
});
