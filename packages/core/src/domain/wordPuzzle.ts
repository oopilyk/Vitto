/**
 * WordPuzzle -- the daily word puzzle.
 *
 * Five rounds a day at lengths [4, 5, 5, 6, 6], with the guess budget equal to the
 * word length. Everything here is pure and hermetically deterministic: the same
 * puzzle date yields the same puzzle on every device, every platform and every run,
 * with no `Math.random`, no `Date.now`, and no locale-sensitive call in the path.
 *
 * Answers live behind {@link revealAnswer} rather than inside {@link WordPuzzlePuzzle}
 * so a client can lay out the board -- and re-render it mid-session -- without ever
 * holding the solution it has not earned yet.
 */
import { WORD_PUZZLE_WORDS, type WordPuzzleWordLength } from '../data/wordPuzzleWords';
import type { BrainTrainingMetadata, HealthEvent, WordPuzzleRoundOutcome } from './health';
import { calculateStreaks, toDateKey, type StreakSummary } from './streaks';

export const WORD_PUZZLE_ROUNDS = 5;
export const WORD_PUZZLE_LENGTHS = [4, 5, 5, 6, 6] as const;
export const WORD_PUZZLE_GENERATOR_VERSION = 1;
/** Day zero of the schedule. The shuffle is seeded from this, never from the date. */
export const WORD_PUZZLE_EPOCH = '2026-01-01';

export type LetterMark = 'correct' | 'present' | 'absent';

export interface WordPuzzleRound {
  index: number;
  length: number;
  /** Always equal to `length`: the guess budget is the word length. */
  maxGuesses: number;
}

export interface WordPuzzlePuzzle {
  puzzleDate: string;
  generatorVersion: number;
  rounds: WordPuzzleRound[];
}

// ---------------------------------------------------------------------------
// Seeded RNG -- xmur3 to spread a string seed, mulberry32 to draw from it.
// Inlined deliberately: a dependency here would be a determinism liability.
// ---------------------------------------------------------------------------

const xmur3 = (seed: string): (() => number) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rngFromSeed = (seed: string): (() => number) => mulberry32(xmur3(seed)());

// ---------------------------------------------------------------------------
// Date arithmetic -- UTC only, so a device's timezone can never shift a puzzle.
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86400000;

const toUtcMs = (puzzleDate: string): number => {
  if (!DATE_PATTERN.test(puzzleDate)) {
    throw new Error(`Invalid WordPuzzle puzzle date: ${puzzleDate}`);
  }
  const year = Number(puzzleDate.slice(0, 4));
  const month = Number(puzzleDate.slice(5, 7));
  const day = Number(puzzleDate.slice(8, 10));
  const ms = Date.UTC(year, month - 1, day);
  const utc = new Date(ms);
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new Error(`Invalid WordPuzzle puzzle date: ${puzzleDate}`);
  }
  return ms;
};

const EPOCH_MS = toUtcMs(WORD_PUZZLE_EPOCH);

/** Whole days from {@link WORD_PUZZLE_EPOCH}; negative for dates before it. */
const dayNumber = (puzzleDate: string): number => (toUtcMs(puzzleDate) - EPOCH_MS) / MS_PER_DAY;

/** Euclidean modulo, so pre-epoch dates still land inside the permutation. */
const wrap = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

// ---------------------------------------------------------------------------
// Wordlist access. CORE-0 ships the data raw; the lookups are ours.
// ---------------------------------------------------------------------------

const isWordLength = (length: number): length is WordPuzzleWordLength =>
  length === 4 || length === 5 || length === 6;

const wordAt = (length: WordPuzzleWordLength, index: number): string => {
  const { words } = WORD_PUZZLE_WORDS[length];
  return words.slice(index * length, index * length + length);
};

/** Explicit ASCII comparison. `localeCompare` would make the list order machine-dependent. */
const compareAscii = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** O(log n) over the fixed-width, ASCII-ascending list. Returns -1 when absent. */
const indexOfWord = (length: WordPuzzleWordLength, word: string): number => {
  const { count } = WORD_PUZZLE_WORDS[length];
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const cmp = compareAscii(wordAt(length, mid), word);
    if (cmp === 0) return mid;
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Hand-rolled because `atob` is a DOM API and `Buffer` is Node's: this package has
 * to decode identically under Hermes, jsdom and node.
 */
const decodeBase64 = (input: string): Uint8Array => {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) throw new Error('Malformed WordPuzzle answer mask');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
};

const maskCache = new Map<WordPuzzleWordLength, Uint8Array>();

const answerMaskFor = (length: WordPuzzleWordLength): Uint8Array => {
  const cached = maskCache.get(length);
  if (cached) return cached;
  const decoded = decodeBase64(WORD_PUZZLE_WORDS[length].answerMask);
  maskCache.set(length, decoded);
  return decoded;
};

/** Bits are most-significant-first, so word `i` is bit `0b1000_0000 >> (i & 7)` of byte `i >> 3`. */
const isAnswerEligible = (length: WordPuzzleWordLength, index: number): boolean => {
  const mask = answerMaskFor(length);
  const byte = mask[index >> 3];
  if (byte === undefined) return false;
  return (byte & (0b1000_0000 >> (index & 7))) !== 0;
};

// ---------------------------------------------------------------------------
// The schedule.
//
// No-repeat is structural, not sampled. Each length's answer-eligible pool is
// shuffled once, deterministically, from a seed derived from the EPOCH -- so the
// order is the same forever -- and the daily draw is an index into that
// permutation. A word therefore cannot recur until the pool has been fully spent,
// which at 365 draws/year (4-letter) and 730 (5- and 6-letter) is ~4.5, ~3.2 and
// ~4.2 years respectively. The 5-letter pool is the binding constraint.
// ---------------------------------------------------------------------------

/** How many rounds of each length a single day draws. */
const DRAWS_PER_DAY: Record<number, number> = WORD_PUZZLE_LENGTHS.reduce<Record<number, number>>(
  (counts, length) => ({ ...counts, [length]: (counts[length] ?? 0) + 1 }),
  {},
);

/** For each round: its length, and which draw of that length within the day it is. */
const ROUND_PLAN = WORD_PUZZLE_LENGTHS.map((length, index) => ({
  index,
  length,
  ordinal: WORD_PUZZLE_LENGTHS.slice(0, index).filter((other) => other === length).length,
}));

/** Lengths drawn more than once a day, ascending -- the pairs whose order the date seed decides. */
const PAIRED_LENGTHS = [...new Set(WORD_PUZZLE_LENGTHS)]
  .filter((length) => (DRAWS_PER_DAY[length] ?? 0) > 1)
  .sort((a, b) => a - b);

const permutationCache = new Map<WordPuzzleWordLength, Int32Array>();

const permutationFor = (length: WordPuzzleWordLength): Int32Array => {
  const cached = permutationCache.get(length);
  if (cached) return cached;

  const { count, answerCount } = WORD_PUZZLE_WORDS[length];
  const pool = new Int32Array(answerCount);
  let written = 0;
  for (let i = 0; i < count; i += 1) {
    if (isAnswerEligible(length, i)) {
      if (written >= answerCount) throw new Error(`WordPuzzle mask over-reports length ${length}`);
      pool[written] = i;
      written += 1;
    }
  }
  if (written !== answerCount) {
    throw new Error(`WordPuzzle answer mask for length ${length} sets ${written} bits, expected ${answerCount}`);
  }

  // Seeded from the epoch, never the date: one fixed order for all time.
  const rng = rngFromSeed(`${WORD_PUZZLE_EPOCH}:len${length}:v${WORD_PUZZLE_GENERATOR_VERSION}`);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = swap;
  }

  permutationCache.set(length, pool);
  return pool;
};

const orderingCache = new Map<string, Record<number, boolean>>();

/**
 * The one job of the per-date seed: within a day, decide which of the two same-length
 * draws is shown first. It cannot affect *which* words a day draws, so the no-repeat
 * guarantee above is untouched.
 */
const orderingFor = (puzzleDate: string): Record<number, boolean> => {
  const cached = orderingCache.get(puzzleDate);
  if (cached) return cached;
  const rng = rngFromSeed(`${puzzleDate}:v${WORD_PUZZLE_GENERATOR_VERSION}`);
  const ordering: Record<number, boolean> = {};
  for (const length of PAIRED_LENGTHS) ordering[length] = rng() < 0.5;
  orderingCache.set(puzzleDate, ordering);
  return ordering;
};

export const generateWordPuzzle = (puzzleDate: string): WordPuzzlePuzzle => {
  toUtcMs(puzzleDate);
  return {
    puzzleDate,
    generatorVersion: WORD_PUZZLE_GENERATOR_VERSION,
    rounds: ROUND_PLAN.map(({ index, length }) => ({ index, length, maxGuesses: length })),
  };
};

/** Answers resolved separately so puzzle shape can render without them. */
export const revealAnswer = (puzzleDate: string, roundIndex: number): string => {
  const plan = ROUND_PLAN[roundIndex];
  if (!plan || !Number.isInteger(roundIndex)) {
    throw new Error(`WordPuzzle round index out of range: ${roundIndex}`);
  }
  const { length, ordinal } = plan;
  if (!isWordLength(length)) throw new Error(`Unsupported WordPuzzle word length: ${length}`);

  const perDay = DRAWS_PER_DAY[length]!;
  const flipped = orderingFor(puzzleDate)[length] ?? false;
  const slot = flipped ? perDay - 1 - ordinal : ordinal;

  const permutation = permutationFor(length);
  const draw = dayNumber(puzzleDate) * perDay + slot;
  return wordAt(length, permutation[wrap(draw, permutation.length)]!);
};

// ---------------------------------------------------------------------------
// Guessing.
// ---------------------------------------------------------------------------

export const isValidGuess = (guess: string): boolean => {
  const word = guess.toLowerCase();
  if (!isWordLength(word.length)) return false;
  return indexOfWord(word.length, word) >= 0;
};

/**
 * Two passes, and the order matters. Exact hits are claimed first; only then are the
 * leftover guess letters matched against a tally of the answer letters that are still
 * unclaimed. A one-pass implementation marks both Es of SPEED against ERASE as present,
 * which is wrong -- ERASE has only one E left once the exact match is taken.
 */
export const markGuess = (guess: string, answer: string): LetterMark[] => {
  const guessed = guess.toLowerCase();
  const target = answer.toLowerCase();
  const marks: LetterMark[] = new Array(guessed.length).fill('absent');

  const remaining = new Map<string, number>();
  for (let i = 0; i < target.length; i += 1) {
    const letter = target[i]!;
    if (guessed[i] === letter) marks[i] = 'correct';
    else remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
  }

  for (let i = 0; i < guessed.length; i += 1) {
    if (marks[i] === 'correct') continue;
    const letter = guessed[i]!;
    const left = remaining.get(letter) ?? 0;
    if (left > 0) {
      marks[i] = 'present';
      remaining.set(letter, left - 1);
    }
  }

  return marks;
};

// ---------------------------------------------------------------------------
// Scoring. Two numbers on purpose.
//
//   - The pet engine gate reads `correct`/`total`, which is rounds solved out of 5,
//     so the sharp bar sits at exactly 4/5 = 0.8 regardless of guesses used.
//   - `wordPuzzleScore` is the 0-100 number a player sees, and it is where guess
//     efficiency lives.
// ---------------------------------------------------------------------------

const POINTS_PER_ROUND = 20;
const POINTS_SPARE = 16;
const POINTS_FINAL_GUESS = 12;

const roundPoints = ({ length, solved, guessesUsed }: WordPuzzleRoundOutcome): number => {
  if (!solved) return 0;
  if (guessesUsed <= Math.floor(length / 2)) return POINTS_PER_ROUND;
  if (guessesUsed < length) return POINTS_SPARE;
  return POINTS_FINAL_GUESS;
};

export const wordPuzzleScore = (outcomes: WordPuzzleRoundOutcome[]): number => {
  const total = outcomes.reduce((sum, outcome) => sum + roundPoints(outcome), 0);
  return Math.max(0, Math.min(100, total));
};

export const wordPuzzleSolvedCount = (outcomes: WordPuzzleRoundOutcome[]): number =>
  outcomes.reduce((count, outcome) => count + (outcome.solved ? 1 : 0), 0);

/**
 * `roundOutcomes` is rebuilt field by field rather than passed through, so no answer
 * can ride along into an event the user can read back later. A player's own history
 * must never become a spoiler archive.
 */
export const toWordPuzzleMetadata = (
  puzzle: WordPuzzlePuzzle,
  outcomes: WordPuzzleRoundOutcome[],
  durationSeconds: number,
): BrainTrainingMetadata => ({
  game: 'wordPuzzle',
  correct: wordPuzzleSolvedCount(outcomes),
  total: WORD_PUZZLE_ROUNDS,
  durationSeconds,
  score: wordPuzzleScore(outcomes),
  puzzleDate: puzzle.puzzleDate,
  generatorVersion: puzzle.generatorVersion,
  roundOutcomes: outcomes.map(({ length, solved, guessesUsed }) => ({ length, solved, guessesUsed })),
});

// ---------------------------------------------------------------------------
// History and streaks.
// ---------------------------------------------------------------------------

const asWordPuzzleEvent = (event: HealthEvent): HealthEvent<BrainTrainingMetadata> | null => {
  if (event.type !== 'BRAIN_TRAINING') return null;
  const metadata = event.metadata as BrainTrainingMetadata | null | undefined;
  if (!metadata || metadata.game !== 'wordPuzzle') return null;
  return event as HealthEvent<BrainTrainingMetadata>;
};

export const findWordPuzzleEventForDate = (
  events: HealthEvent[],
  puzzleDate: string,
): HealthEvent<BrainTrainingMetadata> | null => {
  for (const event of events) {
    const wordPuzzle = asWordPuzzleEvent(event);
    if (wordPuzzle && wordPuzzle.metadata.puzzleDate === puzzleDate) return wordPuzzle;
  }
  return null;
};

/**
 * Keyed on `puzzleDate`, not `occurredAt`. Puzzle identity is fixed when the player
 * opens the day's board; `occurredAt` is when they finished. A session carried across
 * midnight would otherwise credit the wrong day and break an honest streak.
 */
export const wordPuzzleStreak = (events: HealthEvent[], today: Date = new Date()): StreakSummary => {
  const wordPuzzleEvents = events.filter((event) => asWordPuzzleEvent(event) !== null);
  return calculateStreaks(wordPuzzleEvents, today, (event) => {
    const metadata = event.metadata as BrainTrainingMetadata;
    return metadata.puzzleDate ?? toDateKey(new Date(event.occurredAt));
  });
};
