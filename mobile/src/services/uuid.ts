import * as Crypto from 'expo-crypto';

/** expo-crypto's randomUUID is a native call, so it can be absent in an older client. */
export const randomUUID = (): string => Crypto.randomUUID();

/**
 * Probes the native module once at startup. If it is missing — the same failure mode
 * as expo-file-system's `File` in some Expo Go builds — the domain keeps its own pure
 * generator rather than crashing the first time anything needs an id.
 */
export const hasNativeUUID = (): boolean => {
  try {
    return typeof Crypto.randomUUID() === 'string';
  } catch {
    return false;
  }
};
