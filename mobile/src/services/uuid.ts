import * as Crypto from 'expo-crypto';

/** Hermes has no global crypto.randomUUID, so route every id through expo-crypto. */
export const randomUUID = (): string => Crypto.randomUUID();
