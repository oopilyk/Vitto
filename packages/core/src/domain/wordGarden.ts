/**
 * Word garden -- grow words from six letters, every one of them rooted in the
 * seed letter in the middle.
 *
 * What makes it its own game rather than a letter-wheel clone:
 *
 *   - A run multiplier. Consecutive accepted words grow the multiplier from x1
 *     up to x3, and any refused entry -- not a word, too short, already found --
 *     withers it back to x1. Guessing wildly costs you; steady finds compound.
 *   - Growth stages instead of a percentile ladder. Points carry the garden from
 *     Seed through Sprout and Bud to Full bloom, and a word that uses every letter
 *     on the board is a "bloom" worth a bonus.
 *
 * The lexicon runs 4 to 6 letters, so the board is six letters and a bloom is a
 * six-letter word using all of them. Every board is seeded from such a word, which
 * guarantees at least one bloom exists, and boards with too few words are rerolled.
 *
 * Only answer-eligible words count. That pool is the common, inoffensive one the
 * daily word puzzle draws from, so a player is never told an obscure word they
 * have never heard of was "missed".
 */
import type { WordPuzzleWordLength } from '../data/wordPuzzleWords';
import type { BrainTrainingMetadata } from './health';
import { answerEligibleWords } from './wordPuzzle';

export const WORD_GARDEN_LETTERS = 6;
export const WORD_GARDEN_MIN_WORD_LENGTH = 4;
/** A board with fewer accepted words than this is rerolled. */
export const WORD_GARDEN_MIN_WORDS = 15;
export const WORD_GARDEN_BLOOM_BONUS = 7;
/** Base points, as a share of the board's maximum, that earn a perfect mind score. */
export const WORD_GARDEN_FULL_BLOOM_SHARE = 0.7;
/** Consecutive finds needed for each multiplier step: x2 after two, x3 after four. */
export const WORD_GARDEN_MULTIPLIER_STEPS = [2, 4] as const;
export const WORD_GARDEN_MAX_MULTIPLIER = WORD_GARDEN_MULTIPLIER_STEPS.length + 1;

const LENGTHS: WordPuzzleWordLength[] = [4, 5, 6];

export interface WordGardenPuzzle {
  /** The letter every word must contain. */
  seed: string;
  /** The other five letters, in display order. */
  petals: string[];
  /** Every accepted word, ASCII-ascending. */
  words: string[];
  /** Sum of base points over every word, before any multiplier. */
  maxPoints: number;
  /** Points needed for the Full bloom stage. */
  fullBloomPoints: number;
  bloomCount: number;
}

/** One accepted word and what it was worth at the moment it landed. */
export interface WordGardenFind {
  word: string;
  points: number;
  multiplier: number;
}

export type WordGardenVerdict =
  | 'accepted'
  | 'too-short'
  | 'missing-seed'
  | 'bad-letter'
  | 'not-a-word'
  | 'already-found';

export interface WordGardenStage {
  name: string;
  /** Share of `maxPoints` needed to reach it, 0..1. */
  share: number;
}

/** Ascending, so the last stage whose bar is met is the current one. */
export const WORD_GARDEN_STAGES: WordGardenStage[] = [
  { name: 'Seed', share: 0 },
  { name: 'Sprout', share: 0.05 },
  { name: 'Seedling', share: 0.12 },
  { name: 'Leafy', share: 0.2 },
  { name: 'Budding', share: 0.35 },
  { name: 'Blossoming', share: 0.5 },
  { name: 'Full bloom', share: WORD_GARDEN_FULL_BLOOM_SHARE },
  { name: 'Wild garden', share: 1 },
];

type Rng = () => number;

const uniqueLetters = (word: string): boolean => new Set(word).size === word.length;

const usesOnly = (word: string, allowed: Set<string>): boolean => {
  for (let i = 0; i < word.length; i += 1) {
    if (!allowed.has(word[i]!)) return false;
  }
  return true;
};

type Board = Pick<WordGardenPuzzle, 'seed' | 'petals'>;

export const isWordGardenBloom = (word: string, board: Board): boolean =>
  new Set(word).size === WORD_GARDEN_LETTERS && usesOnly(word, new Set([board.seed, ...board.petals]));

/** Four-letter words are worth one point; longer words their length; blooms a bonus on top. */
export const wordGardenBasePoints = (word: string, board: Board): number => {
  if (word.length < WORD_GARDEN_MIN_WORD_LENGTH) return 0;
  const base = word.length === WORD_GARDEN_MIN_WORD_LENGTH ? 1 : word.length;
  return base + (isWordGardenBloom(word, board) ? WORD_GARDEN_BLOOM_BONUS : 0);
};

/** The multiplier a run of `streak` consecutive finds has earned. */
export const wordGardenMultiplier = (streak: number): number => {
  let multiplier = 1;
  for (const step of WORD_GARDEN_MULTIPLIER_STEPS) if (streak >= step) multiplier += 1;
  return multiplier;
};

const buildPuzzle = (seed: string, petals: string[]): WordGardenPuzzle => {
  const allowed = new Set([seed, ...petals]);
  const words: string[] = [];
  for (const length of LENGTHS) {
    for (const word of answerEligibleWords(length)) {
      if (word.includes(seed) && usesOnly(word, allowed)) words.push(word);
    }
  }
  words.sort();
  const board = { seed, petals };
  const maxPoints = words.reduce((sum, word) => sum + wordGardenBasePoints(word, board), 0);
  return {
    seed,
    petals,
    words,
    maxPoints,
    fullBloomPoints: Math.max(1, Math.ceil(maxPoints * WORD_GARDEN_FULL_BLOOM_SHARE)),
    bloomCount: words.filter((word) => isWordGardenBloom(word, board)).length,
  };
};

let seedCache: readonly string[] | null = null;

/**
 * Six-letter words with six different letters and no S. Leaving S off the board
 * keeps the game about finding words rather than pluralising the ones you have.
 */
const bloomSeeds = (): readonly string[] => {
  if (!seedCache) {
    seedCache = answerEligibleWords(6).filter((word) => uniqueLetters(word) && !word.includes('s'));
  }
  return seedCache;
};

const MAX_ATTEMPTS = 200;

/**
 * Random by default so every sitting is a fresh board; pass a seeded `rng` for a
 * repeatable one. `avoid` lets "play again" steer away from the last board.
 */
export const generateWordGarden = (rng: Rng = Math.random, avoid?: string): WordGardenPuzzle => {
  const seeds = bloomSeeds();
  if (seeds.length === 0) throw new Error('Word garden has no bloom seeds');
  let fallback: WordGardenPuzzle | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const source = seeds[Math.floor(rng() * seeds.length)]!;
    if (avoid && source === avoid) continue;
    const letters = source.split('');
    const seed = letters[Math.floor(rng() * letters.length)]!;
    const petals = letters.filter((letter) => letter !== seed);
    // Fisher-Yates so the board never spells out its own bloom.
    for (let i = petals.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const swap = petals[i]!;
      petals[i] = petals[j]!;
      petals[j] = swap;
    }
    const puzzle = buildPuzzle(seed, petals);
    if (puzzle.words.length >= WORD_GARDEN_MIN_WORDS) return puzzle;
    if (!fallback || puzzle.words.length > fallback.words.length) fallback = puzzle;
  }
  return fallback!;
};

export const judgeWordGardenWord = (
  entry: string,
  puzzle: WordGardenPuzzle,
  found: readonly WordGardenFind[],
): WordGardenVerdict => {
  const word = entry.trim().toLowerCase();
  if (word.length < WORD_GARDEN_MIN_WORD_LENGTH) return 'too-short';
  if (!usesOnly(word, new Set([puzzle.seed, ...puzzle.petals]))) return 'bad-letter';
  if (!word.includes(puzzle.seed)) return 'missing-seed';
  if (found.some((find) => find.word === word)) return 'already-found';
  if (!puzzle.words.includes(word)) return 'not-a-word';
  return 'accepted';
};

export const wordGardenVerdictMessage = (verdict: WordGardenVerdict): string => {
  switch (verdict) {
    case 'accepted':
      return 'Nice!';
    case 'too-short':
      return 'Too short';
    case 'missing-seed':
      return 'Needs the seed letter';
    case 'bad-letter':
      return 'Uses a letter that is not in the garden';
    case 'not-a-word':
      return 'Not in the word list';
    case 'already-found':
      return 'Already grown';
  }
};

/**
 * Scores an accepted word given the run it lands on. `streak` is the number of
 * consecutive accepted words before this one.
 */
export const scoreWordGardenFind = (word: string, puzzle: WordGardenPuzzle, streak: number): WordGardenFind => {
  const multiplier = wordGardenMultiplier(streak);
  return { word, multiplier, points: wordGardenBasePoints(word, puzzle) * multiplier };
};

export const wordGardenPoints = (found: readonly WordGardenFind[]): number =>
  found.reduce((sum, find) => sum + find.points, 0);

export const wordGardenStage = (points: number, puzzle: Pick<WordGardenPuzzle, 'maxPoints'>): WordGardenStage => {
  let current = WORD_GARDEN_STAGES[0]!;
  for (const stage of WORD_GARDEN_STAGES) {
    if (points >= Math.ceil(stage.share * puzzle.maxPoints)) current = stage;
  }
  return current;
};

/** Points needed for the next stage up, or null at the top. */
export const wordGardenNextStage = (
  points: number,
  puzzle: Pick<WordGardenPuzzle, 'maxPoints'>,
): { stage: WordGardenStage; points: number } | null => {
  for (const stage of WORD_GARDEN_STAGES) {
    const needed = Math.ceil(stage.share * puzzle.maxPoints);
    if (points < needed) return { stage, points: needed };
  }
  return null;
};

/** 0-100, where reaching Full bloom is a perfect score. */
export const wordGardenScore = (points: number, puzzle: Pick<WordGardenPuzzle, 'fullBloomPoints'>): number =>
  Math.max(0, Math.min(100, Math.round((points / puzzle.fullBloomPoints) * 100)));

export const toWordGardenMetadata = (
  puzzle: WordGardenPuzzle,
  found: readonly WordGardenFind[],
  durationSeconds: number,
): BrainTrainingMetadata => {
  const points = wordGardenPoints(found);
  return {
    game: 'wordGarden',
    correct: Math.min(points, puzzle.fullBloomPoints),
    total: puzzle.fullBloomPoints,
    durationSeconds,
    score: wordGardenScore(points, puzzle),
    letters: `${puzzle.seed}${puzzle.petals.join('')}`,
    wordsFound: found.length,
    points,
    maxPoints: puzzle.maxPoints,
    rank: wordGardenStage(points, puzzle).name,
    bestMultiplier: found.reduce((best, find) => Math.max(best, find.multiplier), 1),
  };
};
