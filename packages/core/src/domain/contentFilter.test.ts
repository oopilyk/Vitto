import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as generated from '../data/blockedTerms';
import { WORD_PUZZLE_WORDS } from '../data/wordPuzzleWords';
import { hasBlockedTerm } from './contentFilter';
import { termHash } from './termHash';

/** The fixtures the hashed lists are made from; tests only, never the app. */
const fixture = (file: string) => readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').split('\n').map((line) => line.trim());
const BLOCKED_TERMS: string[] = (() => {
  const terms: string[] = [];
  let tier: string | null = null;
  for (const line of fixture('offensiveWords.fixture.txt')) {
    const heading = /^\[(\w+)\]/.exec(line);
    if (heading) tier = heading[1];
    else if (line && !line.startsWith('#') && tier === 'severe') terms.push(line.toLowerCase());
  }
  return terms;
})();
const ALLOWED_WORDS = fixture('allowedContaining.fixture.txt').filter((line) => line && !line.startsWith('#'));

// Terms are taken from the list itself rather than written out here.
const short = BLOCKED_TERMS.find((term) => !term.includes(' ') && term.length === 4 && /^[a-z]+$/.test(term))!;
const long = BLOCKED_TERMS.find((term) => !term.includes(' ') && term.length >= 6 && /^[a-z]+$/.test(term))!;
const phrase = BLOCKED_TERMS.find((term) => term.includes(' ') && /^[a-z ]+$/.test(term))!;
const leet = (word: string) => word.replace(/o/g, '0').replace(/e/g, '3').replace(/a/g, '4').replace(/i/g, '1');

describe('hasBlockedTerm', () => {
  it('finds a term as a word, in capitals, in look-alike characters, and run into a username', () => {
    expect(hasBlockedTerm(`hi ${short} there`)).toBe(true);
    expect(hasBlockedTerm(short.toUpperCase())).toBe(true);
    expect(hasBlockedTerm(leet(long))).toBe(true);
    expect(hasBlockedTerm(`xx${long}xx`)).toBe(true);
    expect(hasBlockedTerm(`my_${short}_99`)).toBe(true);
    expect(hasBlockedTerm(`so ${phrase} ok`)).toBe(true);
  });

  it('leaves ordinary words, names and bios alone', () => {
    for (const fine of [
      'therapist', 'grapes', 'classic', 'scunthorpe', 'assassin', 'cockpit', 'sussex', 'shitake', 'dickens', 'analysis',
      'kyle_li', 'gymrat2005', 'Training for my first half marathon. Coffee first.', 'Miso', 'Hancock', 'Essex',
    ]) {
      expect(hasBlockedTerm(fine), fine).toBe(false);
    }
  });

  it('matches exactly what the plain-word filter it replaced matched', () => {
    // The previous implementation, word lists in the clear: the reference.
    const LOOK: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
    const single = BLOCKED_TERMS.filter((term) => !term.includes(' '));
    const short = new Set(single.filter((term) => term.length <= 4));
    const long = single.filter((term) => term.length > 4);
    const phrases = BLOCKED_TERMS.filter((term) => term.includes(' '));
    const allowed = new Set(ALLOWED_WORDS);
    const reference = (text: string) => {
      const normal = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[013457@$!]/g, (char) => LOOK[char] ?? char);
      const words = normal.split(/[^a-z]+/).filter(Boolean);
      if (words.some((word) => short.has(word) || (!allowed.has(word) && long.some((term) => word.includes(term))))) return true;
      const spaced = ` ${words.join(' ')} `;
      return phrases.some((phrase) => spaced.includes(` ${phrase} `));
    };
    const dictionary = Object.values(WORD_PUZZLE_WORDS).flatMap(({ words, length }) => words.match(new RegExp(`.{${length}}`, 'g')) ?? []).filter((_, index) => index % 5 === 0);
    const inputs = [
      ...BLOCKED_TERMS,
      ...BLOCKED_TERMS.map((term) => `x${term.replace(/ /g, '_')}9`),
      ...BLOCKED_TERMS.filter((term) => term.includes(' ')).map((term) => `so ${term} ok`),
      ...ALLOWED_WORDS,
      ...ALLOWED_WORDS.map((word) => `${word}s`),
      ...dictionary,
      ...dictionary.map((word, index) => `${word} ${dictionary[(index * 7) % dictionary.length]}`),
    ];
    const differ = inputs.filter((input) => hasBlockedTerm(input) !== reference(input));
    expect(differ.length).toBe(0);
  });

  it('writes no term out in the app: only hashes, and up to date with the fixtures', () => {
    const shipped = readFileSync(new URL('../data/blockedTerms.ts', import.meta.url), 'utf8').toLowerCase();
    const strings = new Set([...shipped.matchAll(/^\s*"([^"]*)",$/gm)].map((match) => match[1]));
    expect(strings.size).toBeGreaterThan(700);
    expect(BLOCKED_TERMS.filter((term) => strings.has(term))).toEqual([]);
    expect(ALLOWED_WORDS.filter((word) => strings.has(word))).toEqual([]);
    const all = new Set([...generated.BLOCKED_SHORT, ...generated.BLOCKED_LONG, ...generated.BLOCKED_PHRASES]);
    expect(BLOCKED_TERMS.every((term) => all.has(termHash(term)))).toBe(true);
    expect(all.size).toBe(new Set(BLOCKED_TERMS).size);
    expect(new Set(generated.ALLOWED_CONTAINING)).toEqual(new Set(ALLOWED_WORDS.map(termHash)));
  });
});
