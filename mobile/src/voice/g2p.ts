import { normalizeForSpeech } from './normalize';

/**
 * English text to the phonemes Kokoro speaks from.
 *
 * Kokoro was trained on misaki's phoneme set, and misaki's own word lists
 * (hexgrad/misaki, Apache-2.0: ~175k words, gold and silver merged) are the
 * lexicon here, so a word found in it is said exactly as Kokoro's own tooling
 * would say it. What is not found is worked out the way misaki does for
 * inflections ("lifted" from "lift", "running" from "run"), then from its
 * parts ("gymbro" from "gym" + "bro"), and only then sounded out letter by
 * letter. No espeak: it is GPL, and it is not needed for lines this short.
 */

export type Lexicon = ReadonlyMap<string, string>;

/** The lexicon file: one "word<TAB>phonemes" per line. */
export const parseLexicon = (text: string): Lexicon => {
  const map = new Map<string, string>();
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const tab = text.indexOf('\t', start);
    if (tab > start && tab < end) map.set(text.slice(start, tab), text.slice(tab + 1, end));
    start = end + 1;
  }
  return map;
};

const VOWELS = 'AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻᵊɐɚ';
const STRESS = /[ˈˌ]/;

const lastSound = (phonemes: string) => phonemes.replace(/[ˈˌː]/g, '').slice(-1);

/** "-s": "lifts" -ts, "reps" -s, "dogs" -z, "boxes" -ɪz. */
const withS = (base: string) => {
  const last = lastSound(base);
  if ('sʃʧzʒʤ'.includes(last)) return `${base}ɪz`;
  if ('ptkfθ'.includes(last)) return `${base}s`;
  return `${base}z`;
};

/** "-ed": "lifted" -ᵻd, "walked" -t, "logged" -d. */
const withEd = (base: string) => {
  const last = lastSound(base);
  if ('td'.includes(last)) return `${base}ᵻd`;
  if ('pkfθʃsʧ'.includes(last)) return `${base}t`;
  return `${base}d`;
};

const LETTER_NAMES: Record<string, string> = {
  a: 'ˈA', b: 'bˈi', c: 'sˈi', d: 'dˈi', e: 'ˈi', f: 'ˈɛf', g: 'ʤˈi', h: 'ˈAʧ', i: 'ˈI', j: 'ʤˈA', k: 'kˈA', l: 'ˈɛl', m: 'ˈɛm',
  n: 'ˈɛn', o: 'ˈO', p: 'pˈi', q: 'kjˈu', r: 'ˈɑɹ', s: 'ˈɛs', t: 'tˈi', u: 'jˈu', v: 'vˈi', w: 'dˈʌbəlju', x: 'ˈɛks', y: 'wˈI', z: 'zˈi',
};

/** Spelling patterns, longest first. A last resort, for names and made-up words. */
const PATTERNS: [RegExp, string][] = [
  [/^tion/, 'ʃən'], [/^sion/, 'ʒən'], [/^igh/, 'I'], [/^tch/, 'ʧ'], [/^dge/, 'ʤ'], [/^ough/, 'ɔ'],
  [/^ch/, 'ʧ'], [/^sh/, 'ʃ'], [/^th/, 'θ'], [/^ph/, 'f'], [/^ck/, 'k'], [/^ng/, 'ŋ'], [/^qu/, 'kw'], [/^wh/, 'w'], [/^kn/, 'n'],
  [/^ee/, 'i'], [/^ea/, 'i'], [/^oo/, 'u'], [/^ai/, 'A'], [/^ay/, 'A'], [/^oa/, 'O'], [/^ow/, 'W'], [/^ou/, 'W'], [/^oi/, 'Y'],
  [/^oy/, 'Y'], [/^ie/, 'i'], [/^ey/, 'i'], [/^ue/, 'u'], [/^ar/, 'ɑɹ'], [/^or/, 'ɔɹ'], [/^er/, 'ɜɹ'], [/^ir/, 'ɜɹ'], [/^ur/, 'ɜɹ'],
  [/^c(?=[eiy])/, 's'], [/^g(?=[eiy])/, 'ʤ'], [/^y(?=[aeiou])/, 'j'], [/^y$/, 'i'], [/^y/, 'ɪ'],
  [/^a(?=[^aeiou]e$)/, 'A'], [/^i(?=[^aeiou]e$)/, 'I'], [/^o(?=[^aeiou]e$)/, 'O'], [/^u(?=[^aeiou]e$)/, 'ju'], [/^e$/, ''],
  [/^a/, 'æ'], [/^e/, 'ɛ'], [/^i/, 'ɪ'], [/^o/, 'ɑ'], [/^u/, 'ʌ'],
  [/^b+/, 'b'], [/^c+/, 'k'], [/^d+/, 'd'], [/^f+/, 'f'], [/^g+/, 'ɡ'], [/^h/, 'h'], [/^j/, 'ʤ'], [/^k+/, 'k'], [/^l+/, 'l'],
  [/^m+/, 'm'], [/^n+/, 'n'], [/^p+/, 'p'], [/^r+/, 'ɹ'], [/^s+/, 's'], [/^t+/, 't'], [/^v/, 'v'], [/^w/, 'w'], [/^x/, 'ks'], [/^z+/, 'z'],
];

/** Sounds a word out from its spelling, stressed on its first vowel. */
export const soundOut = (word: string): string => {
  let rest = word.toLowerCase().replace(/[^a-z]/g, '');
  let out = '';
  while (rest) {
    const hit = PATTERNS.find(([pattern]) => pattern.test(rest));
    if (!hit) {
      rest = rest.slice(1);
      continue;
    }
    const match = rest.match(hit[0])![0];
    out += hit[1];
    rest = rest.slice(match.length || 1);
  }
  const firstVowel = [...out].findIndex((char) => VOWELS.includes(char));
  return firstVowel < 0 ? out : `${out.slice(0, firstVowel)}ˈ${out.slice(firstVowel)}`;
};

const lookup = (lexicon: Lexicon, word: string): string | undefined =>
  lexicon.get(word) ?? lexicon.get(word.toLowerCase()) ?? lexicon.get(word[0].toUpperCase() + word.slice(1).toLowerCase());

/** A word through the lexicon, its inflections, or its parts. Undefined when none of them know it. */
const known = (lexicon: Lexicon, word: string, depth = 0): string | undefined => {
  const found = lookup(lexicon, word);
  if (found) return found;
  const lower = word.toLowerCase();

  if (lower.endsWith("'s")) {
    const base = known(lexicon, word.slice(0, -2), depth);
    if (base) return withS(base);
  }
  if (lower.endsWith('s') && lower.length > 3) {
    const base = known(lexicon, word.slice(0, -1), depth) ?? (lower.endsWith('es') ? known(lexicon, word.slice(0, -2), depth) : undefined);
    if (base) return withS(base);
  }
  if (lower.endsWith('ed') && lower.length > 4) {
    const stem = word.slice(0, -2);
    const base = known(lexicon, stem, depth) ?? known(lexicon, `${stem}e`, depth) ?? (stem.at(-1) === stem.at(-2) ? known(lexicon, stem.slice(0, -1), depth) : undefined);
    if (base) return withEd(base);
  }
  if (lower.endsWith('ing') && lower.length > 5) {
    const stem = word.slice(0, -3);
    const base = known(lexicon, stem, depth) ?? known(lexicon, `${stem}e`, depth) ?? (stem.at(-1) === stem.at(-2) ? known(lexicon, stem.slice(0, -1), depth) : undefined);
    if (base) return `${base}ɪŋ`;
  }
  // Two known words run together: the longest first part that leaves a known rest.
  if (depth === 0 && lower.length >= 6) {
    for (let cut = lower.length - 3; cut >= 3; cut -= 1) {
      const head = lookup(lexicon, lower.slice(0, cut));
      const tail = head ? known(lexicon, lower.slice(cut), 1) : undefined;
      if (head && tail) return head + tail.replace(/ˈ/g, 'ˌ');
    }
  }
  return undefined;
};

const wordToPhonemes = (lexicon: Lexicon, word: string): string => {
  const found = known(lexicon, word);
  if (found) return found;
  // "HIIT", "BMI": letters.
  if (word.length <= 4 && word === word.toUpperCase()) return [...word.toLowerCase()].map((letter) => LETTER_NAMES[letter] ?? '').join('');
  return soundOut(word);
};

const PUNCTUATION = /^[.,!?;:—…"()“”]$/;

/** [before a consonant, before a vowel]. */
const WEAK_FORMS: Record<string, [string, string]> = {
  a: ['ɐ', 'ɐ'],
  an: ['ən', 'ən'],
  the: ['ðə', 'ði'],
  to: ['tə', 'tu'],
};

/** The whole line, as Kokoro's phoneme string: "hˈɛlO, bˈʌdi!" */
export const phonemize = (text: string, lexicon: Lexicon): string => {
  const tokens = normalizeForSpeech(text)
    .replace(/[-–]/g, ' ')
    .replace(/\.{3}/g, '…')
    .match(/[A-Za-z]+(?:'[A-Za-z]+)*|[.,!?;:—…"()“”]/g);
  if (!tokens) return '';
  let out = '';
  tokens.forEach((token, index) => {
    if (PUNCTUATION.test(token)) {
      out = out.trimEnd() + token + ' ';
      return;
    }
    const lower = token.toLowerCase();
    const next = tokens[index + 1];
    const beforeVowel = !!next && !PUNCTUATION.test(next) && VOWELS.includes(wordToPhonemes(lexicon, next).replace(STRESS, '')[0]);
    // The little words, said weak the way misaki says them: "a" is "uh", not
    // the letter, and "the"/"to" become "thee"/"too" before a vowel.
    const weak = WEAK_FORMS[lower];
    out += `${weak ? weak[beforeVowel ? 1 : 0] : wordToPhonemes(lexicon, token)} `;
  });
  return out.trim();
};
