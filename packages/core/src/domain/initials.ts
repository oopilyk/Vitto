/**
 * The first character of a name, for an avatar disc, upper-cased. Taken by
 * code point, not by UTF-16 unit: `slice(0, 1)` cut an emoji-first name's
 * emoji in half and the disc showed a broken "?".
 */
export const initialOf = (text: string | undefined | null, fallback = '?'): string => {
  const first = Array.from((text ?? '').trim())[0];
  return first ? first.toUpperCase() : fallback;
};
