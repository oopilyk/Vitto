/**
 * Spelling bee -- make words from six letters, always using the centre one.
 *
 * The lexicon only runs 4 to 6 letters, so the board is six letters rather than
 * the usual seven: the "pangram" is a six-letter word that uses every letter on
 * the board. Every board is seeded from such a word, which guarantees at least
 * one pangram exists, and boards with too few words are thrown back.
 *
 * Only answer-eligible words count. That pool is the common, inoffensive one the
 * daily word puzzle draws from, so a player is never told an obscure word they
 * have never heard of was "missed".
 */
import type { WordPuzzleWordLength } from '../data/wordPuzzleWords';
import type { BrainTrainingMetadata } from './health';
import { answerEligibleWords } from './wordPuzzle';

export const SPELLING_BEE_LETTERS = 6;
export const SPELLING_BEE_MIN_WORD_LENGTH = 4;
/** A board with fewer accepted words than this is rerolled. */
export const SPELLING_BEE_MIN_WORDS = 15;
export const SPELLING_BEE_PANGRAM_BONUS = 7;
/** Points, as a share of the board's maximum, that earn a perfect mind score. */
export const SPELLING_BEE_GENIUS_SHARE = 0.7;

const LENGTHS: WordPuzzleWordLength[] = [4, 5, 6];

export interface SpellingBeePuzzle {
  /** The letter every word must contain. */
  center: string;
  /** The other five letters, in display order. */
  outer: string[];
  /** Every accepted word, ASCII-ascending. */
  words: string[];
  maxPoints: number;
  /** Points needed for the top rank. */
  geniusPoints: number;
  pangramCount: number;
}

export type SpellingBeeVerdict =
  | 'accepted'
  | 'too-short'
  | 'missing-center'
  | 'bad-letter'
  | 'not-a-word'
  | 'already-found';

export interface SpellingBeeRank {
  name: string;
  /** Share of `maxPoints` needed to reach it, 0..1. */
  share: number;
}

/** Ascending, so the last rank whose bar is met is the current one. */
export const SPELLING_BEE_RANKS: SpellingBeeRank[] = [
  { name: 'Beginner', share: 0 },
  { name: 'Good start', share: 0.02 },
  { name: 'Moving up', share: 0.05 },
  { name: 'Good', share: 0.08 },
  { name: 'Solid', share: 0.15 },
  { name: 'Nice', share: 0.25 },
  { name: 'Great', share: 0.4 },
  { name: 'Amazing', share: 0.5 },
  { name: 'Genius', share: SPELLING_BEE_GENIUS_SHARE },
  { name: 'Queen bee', share: 1 },
];

type Rng = () => number;

const uniqueLetters = (word: string): boolean => new Set(word).size === word.length;

const usesOnly = (word: string, allowed: Set<string>): boolean => {
  for (let i = 0; i < word.length; i += 1) {
    if (!allowed.has(word[i]!)) return false;
  }
  return true;
};

export const isSpellingBeePangram = (word: string, puzzle: Pick<SpellingBeePuzzle, 'center' | 'outer'>): boolean =>
  new Set(word).size === SPELLING_BEE_LETTERS && usesOnly(word, new Set([puzzle.center, ...puzzle.outer]));

/** Four-letter words are worth one point; longer words their length; pangrams a bonus on top. */
export const spellingBeeWordPoints = (word: string, puzzle: Pick<SpellingBeePuzzle, 'center' | 'outer'>): number => {
  if (word.length < SPELLING_BEE_MIN_WORD_LENGTH) return 0;
  const base = word.length === SPELLING_BEE_MIN_WORD_LENGTH ? 1 : word.length;
  return base + (isSpellingBeePangram(word, puzzle) ? SPELLING_BEE_PANGRAM_BONUS : 0);
};

const buildPuzzle = (center: string, outer: string[]): SpellingBeePuzzle => {
  const allowed = new Set([center, ...outer]);
  const words: string[] = [];
  for (const length of LENGTHS) {
    for (const word of answerEligibleWords(length)) {
      if (word.includes(center) && usesOnly(word, allowed)) words.push(word);
    }
  }
  words.sort();
  const shape = { center, outer };
  const maxPoints = words.reduce((sum, word) => sum + spellingBeeWordPoints(word, shape), 0);
  return {
    center,
    outer,
    words,
    maxPoints,
    geniusPoints: Math.max(1, Math.ceil(maxPoints * SPELLING_BEE_GENIUS_SHARE)),
    pangramCount: words.filter((word) => isSpellingBeePangram(word, shape)).length,
  };
};

let seedCache: readonly string[] | null = null;

/**
 * Six-letter words with six different letters and no S. Leaving S off the board is
 * the classic rule: with it, half the list is plurals and the game becomes typing.
 */
const pangramSeeds = (): readonly string[] => {
  if (!seedCache) {
    seedCache = answerEligibleWords(6).filter((word) => uniqueLetters(word) && !word.includes('s'));
  }
  return seedCache;
};

const MAX_ATTEMPTS = 200;

/**
 * Random by default so every sitting is a fresh board; pass a seeded `rng` for a
 * repeatable one. `avoidCenter` lets "play again" steer away from the last board.
 */
export const generateSpellingBee = (rng: Rng = Math.random, avoid?: string): SpellingBeePuzzle => {
  const seeds = pangramSeeds();
  if (seeds.length === 0) throw new Error('Spelling bee has no pangram seeds');
  let fallback: SpellingBeePuzzle | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const seed = seeds[Math.floor(rng() * seeds.length)]!;
    if (avoid && seed === avoid) continue;
    const letters = seed.split('');
    const center = letters[Math.floor(rng() * letters.length)]!;
    const outer = letters.filter((letter) => letter !== center);
    // Fisher-Yates so the board never spells out its own pangram.
    for (let i = outer.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const swap = outer[i]!;
      outer[i] = outer[j]!;
      outer[j] = swap;
    }
    const puzzle = buildPuzzle(center, outer);
    if (puzzle.words.length >= SPELLING_BEE_MIN_WORDS) return puzzle;
    if (!fallback || puzzle.words.length > fallback.words.length) fallback = puzzle;
  }
  return fallback!;
};

export const judgeSpellingBeeWord = (
  entry: string,
  puzzle: SpellingBeePuzzle,
  found: readonly string[],
): SpellingBeeVerdict => {
  const word = entry.trim().toLowerCase();
  if (word.length < SPELLING_BEE_MIN_WORD_LENGTH) return 'too-short';
  if (!usesOnly(word, new Set([puzzle.center, ...puzzle.outer]))) return 'bad-letter';
  if (!word.includes(puzzle.center)) return 'missing-center';
  if (found.includes(word)) return 'already-found';
  if (!puzzle.words.includes(word)) return 'not-a-word';
  return 'accepted';
};

export const spellingBeeVerdictMessage = (verdict: SpellingBeeVerdict): string => {
  switch (verdict) {
    case 'accepted':
      return 'Nice!';
    case 'too-short':
      return 'Too short';
    case 'missing-center':
      return 'Missing the centre letter';
    case 'bad-letter':
      return 'Uses a letter that is not on the board';
    case 'not-a-word':
      return 'Not in the word list';
    case 'already-found':
      return 'Already found';
  }
};

export const spellingBeePoints = (found: readonly string[], puzzle: SpellingBeePuzzle): number =>
  found.reduce((sum, word) => sum + spellingBeeWordPoints(word, puzzle), 0);

export const spellingBeeRank = (points: number, puzzle: Pick<SpellingBeePuzzle, 'maxPoints'>): SpellingBeeRank => {
  let current = SPELLING_BEE_RANKS[0]!;
  for (const rank of SPELLING_BEE_RANKS) {
    if (points >= Math.ceil(rank.share * puzzle.maxPoints)) current = rank;
  }
  return current;
};

/** Points needed for the next rank up, or null at the top. */
export const spellingBeeNextRank = (
  points: number,
  puzzle: Pick<SpellingBeePuzzle, 'maxPoints'>,
): { rank: SpellingBeeRank; points: number } | null => {
  for (const rank of SPELLING_BEE_RANKS) {
    const needed = Math.ceil(rank.share * puzzle.maxPoints);
    if (points < needed) return { rank, points: needed };
  }
  return null;
};

/** 0-100, where reaching the genius bar is a perfect score. */
export const spellingBeeScore = (points: number, puzzle: Pick<SpellingBeePuzzle, 'geniusPoints'>): number =>
  Math.max(0, Math.min(100, Math.round((points / puzzle.geniusPoints) * 100)));

export const toSpellingBeeMetadata = (
  puzzle: SpellingBeePuzzle,
  found: readonly string[],
  durationSeconds: number,
): BrainTrainingMetadata => {
  const points = spellingBeePoints(found, puzzle);
  return {
    game: 'spellingBee',
    correct: Math.min(points, puzzle.geniusPoints),
    total: puzzle.geniusPoints,
    durationSeconds,
    score: spellingBeeScore(points, puzzle),
    letters: `${puzzle.center}${puzzle.outer.join('')}`,
    wordsFound: found.length,
    points,
    maxPoints: puzzle.maxPoints,
    rank: spellingBeeRank(points, puzzle).name,
  };
};
