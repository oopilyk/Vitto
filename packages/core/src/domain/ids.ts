/**
 * Id generation is a platform concern, so the domain keeps only this seam. Each app
 * installs its own generator at startup — `crypto.randomUUID` on the web,
 * `expo-crypto` on native, where Hermes has no such global. The fallback below keeps
 * the pure domain (and its Node tests) working without importing anything platform.
 */
const fallback = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

let generate: () => string = fallback;

export const newId = (): string => generate();

export const setIdGenerator = (next: () => string) => {
  generate = next;
};
