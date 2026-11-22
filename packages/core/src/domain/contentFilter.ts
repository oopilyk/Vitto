import {
  ALLOWED_CONTAINING,
  BLOCKED_LONG,
  BLOCKED_LONG_LENGTHS,
  BLOCKED_PHRASE_WORDS,
  BLOCKED_PHRASES,
  BLOCKED_SHORT,
} from '../data/blockedTerms';
import { termHash } from './termHash';

/**
 * Keeps slurs and explicit terms out of what other people see: usernames and
 * bios. App Review asks for a filter as well as reporting and blocking
 * wherever users can publish to each other (guideline 1.2).
 *
 * Word-aware, so ordinary words are not caught by a term hiding inside them:
 * a short term (four letters or fewer) only counts as a whole word, a longer
 * one also counts inside a word (a username runs words together) unless the
 * word is an ordinary one that merely contains it ("therapist"), and a
 * phrase counts as a phrase. Look-alike characters are read as letters first
 * (0 as o, 3 as e, $ as s, ...).
 *
 * The terms are the [severe] tier of src/data/offensiveWords.fixture.txt,
 * kept in src/data/blockedTerms.ts as hashes, never as words (see termHash.ts
 * for why): what someone typed is hashed -- each word, each stretch of a word
 * as long as a longer term, each run of words as long as a phrase -- and
 * looked up. Regenerate with scripts/buildBlockedTerms.ts.
 */

const LOOK_ALIKES: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

const normalize = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$!]/g, (char) => LOOK_ALIKES[char] ?? char);

const SHORT = new Set(BLOCKED_SHORT);
const LONG = new Set(BLOCKED_LONG);
const PHRASES = new Set(BLOCKED_PHRASES);
const ALLOWED = new Set(ALLOWED_CONTAINING);

/** Whether some stretch of the word is a longer term. */
const holdsLongTerm = (word: string) =>
  BLOCKED_LONG_LENGTHS.some((length) => {
    for (let at = 0; at + length <= word.length; at += 1) if (LONG.has(termHash(word.slice(at, at + length)))) return true;
    return false;
  });

/** Whether text holds a blocked term, by the rules above. */
export const hasBlockedTerm = (text: string): boolean => {
  const normal = normalize(text);
  const words = normal.split(/[^a-z]+/).filter(Boolean);
  if (words.some((word) => SHORT.has(termHash(word)) || (holdsLongTerm(word) && !ALLOWED.has(termHash(word))))) return true;
  return BLOCKED_PHRASE_WORDS.some((count) => {
    for (let at = 0; at + count <= words.length; at += 1) if (PHRASES.has(termHash(words.slice(at, at + count).join(' ')))) return true;
    return false;
  });
};

export const BLOCKED_USERNAME_MESSAGE = "That username isn't allowed. Try another.";
export const BLOCKED_NAME_MESSAGE = "That name isn't allowed. Try another.";
export const BLOCKED_BIO_MESSAGE = 'Your bio has words that aren’t allowed here.';
export const BLOCKED_PERSONA_MESSAGE = 'Their character has words that aren’t allowed here.';
