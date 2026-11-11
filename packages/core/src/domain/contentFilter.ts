import { ALLOWED_CONTAINING, BLOCKED_TERMS } from '../data/blockedTerms';

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
 * extracted into src/data/blockedTerms.ts.
 */

const LOOK_ALIKES: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

const normalize = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$!]/g, (char) => LOOK_ALIKES[char] ?? char);

const SINGLE = BLOCKED_TERMS.filter((term) => !term.includes(' '));
const SHORT = new Set(SINGLE.filter((term) => term.length <= 4));
const LONG = SINGLE.filter((term) => term.length > 4);
const PHRASES = BLOCKED_TERMS.filter((term) => term.includes(' '));
const ALLOWED = new Set(ALLOWED_CONTAINING);

/** Whether text holds a blocked term, by the rules above. */
export const hasBlockedTerm = (text: string): boolean => {
  const normal = normalize(text);
  const words = normal.split(/[^a-z]+/).filter(Boolean);
  if (words.some((word) => SHORT.has(word) || (!ALLOWED.has(word) && LONG.some((term) => word.includes(term))))) return true;
  const spaced = ` ${words.join(' ')} `;
  return PHRASES.some((phrase) => spaced.includes(` ${phrase} `));
};

export const BLOCKED_USERNAME_MESSAGE = "That username isn't allowed. Try another.";
export const BLOCKED_NAME_MESSAGE = "That name isn't allowed. Try another.";
export const BLOCKED_BIO_MESSAGE = 'Your bio has words that aren’t allowed here.';
