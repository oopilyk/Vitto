import { describe, expect, it } from 'vitest';
import { BLOCKED_TERMS } from '../data/blockedTerms';
import { hasBlockedTerm } from './contentFilter';

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
});
