/**
 * A fast 53-bit string hash (cyrb53), written in base 36.
 *
 * Only so the content filter's word lists are not spelled out in the app: the
 * app carries each term's hash and hashes what someone typed to compare (see
 * contentFilter.ts). App Review reads the strings in a binary, and a plain list
 * of slurs, there only to block them, read to them as the app's own hate
 * speech. Not a secret: a short term's hash can be worked back from, which is
 * fine -- the point is that none is written out.
 *
 * No imports, so scripts/buildBlockedTerms.ts can load this file as it is.
 */
export const termHash = (text: string): string => {
  let h1 = 0xdeadbeef ^ 0x5eed;
  let h2 = 0x41c6ce57 ^ 0x5eed;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
