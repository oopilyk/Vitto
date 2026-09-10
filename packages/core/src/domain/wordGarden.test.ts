import { describe, expect, it } from 'vitest';
import { isCheekyWord } from '../data/cheekyWords';
import {
  WORD_GARDEN_LETTERS,
  WORD_GARDEN_MIN_WORDS,
  type WordGardenFind,
  generateWordGarden,
  isWordGardenBloom,
  judgeWordGardenWord,
  scoreWordGardenFind,
  toWordGardenMetadata,
  wordGardenBasePoints,
  wordGardenMultiplier,
  wordGardenNextStage,
  wordGardenPoints,
  wordGardenScore,
  wordGardenStage,
} from './wordGarden';

const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const find = (word: string, points: number, multiplier = 1): WordGardenFind => ({ word, points, multiplier });

describe('generateWordGarden', () => {
  it('builds a board of six distinct letters with at least one bloom and enough words', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const puzzle = generateWordGarden(seededRng(seed));
      const letters = [puzzle.seed, ...puzzle.petals];
      expect(letters).toHaveLength(WORD_GARDEN_LETTERS);
      expect(new Set(letters).size).toBe(WORD_GARDEN_LETTERS);
      expect(letters).not.toContain('s');
      expect(puzzle.words.length).toBeGreaterThanOrEqual(WORD_GARDEN_MIN_WORDS);
      expect(puzzle.bloomCount).toBeGreaterThanOrEqual(1);
      expect(puzzle.words.every((word) => word.includes(puzzle.seed))).toBe(true);
      expect(puzzle.words.every((word) => word.split('').every((letter) => letters.includes(letter)))).toBe(true);
      expect(puzzle.maxPoints).toBeGreaterThan(0);
      expect(puzzle.fullBloomPoints).toBeLessThanOrEqual(puzzle.maxPoints);
    }
  });

  it('never grows a board from a cheeky word, but lets one count once it fits', () => {
    let cheekyBoards = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const puzzle = generateWordGarden(seededRng(seed));
      const bloomsFromCheeky = puzzle.words.filter((word) => word.length === 6 && isWordGardenBloom(word, puzzle) && isCheekyWord(word));
      // A cheeky word can be a bloom, but the board itself is always seeded from the clean pool.
      expect(puzzle.words.some((word) => !isCheekyWord(word) && isWordGardenBloom(word, puzzle))).toBe(true);
      const cheeky = puzzle.words.find((word) => isCheekyWord(word));
      if (cheeky) {
        cheekyBoards += 1;
        expect(judgeWordGardenWord(cheeky, puzzle, [])).toBe('accepted');
        expect(wordGardenBasePoints(cheeky, puzzle)).toBeGreaterThan(0);
      }
      expect(bloomsFromCheeky.length).toBeLessThanOrEqual(puzzle.bloomCount);
    }
    expect(cheekyBoards).toBeGreaterThan(0);
  });

  it('is repeatable for the same seed', () => {
    expect(generateWordGarden(seededRng(5))).toEqual(generateWordGarden(seededRng(5)));
  });
});

describe('judgeWordGardenWord', () => {
  const puzzle = generateWordGarden(seededRng(3));
  const bloom = puzzle.words.find((word) => isWordGardenBloom(word, puzzle))!;

  it('accepts a real word once and only once', () => {
    expect(judgeWordGardenWord(bloom.toUpperCase(), puzzle, [])).toBe('accepted');
    expect(judgeWordGardenWord(bloom, puzzle, [find(bloom, 13)])).toBe('already-found');
  });

  it('explains each way a word can fail', () => {
    expect(judgeWordGardenWord(puzzle.seed.repeat(3), puzzle, [])).toBe('too-short');
    expect(judgeWordGardenWord(puzzle.petals[0]!.repeat(4), puzzle, [])).toBe('missing-seed');
    expect(judgeWordGardenWord(`${puzzle.seed}sss`, puzzle, [])).toBe('bad-letter');
    const bogus = puzzle.seed.repeat(6);
    expect(puzzle.words).not.toContain(bogus);
    expect(judgeWordGardenWord(bogus, puzzle, [])).toBe('not-a-word');
  });

  it('scores four-letter words as one point and blooms with the bonus', () => {
    const four = puzzle.words.find((word) => word.length === 4);
    if (four) expect(wordGardenBasePoints(four, puzzle)).toBe(1);
    expect(wordGardenBasePoints(bloom, puzzle)).toBe(6 + 7);
  });
});

describe('the run multiplier', () => {
  it('grows with consecutive finds and tops out at x3', () => {
    expect(wordGardenMultiplier(0)).toBe(1);
    expect(wordGardenMultiplier(1)).toBe(1);
    expect(wordGardenMultiplier(2)).toBe(2);
    expect(wordGardenMultiplier(3)).toBe(2);
    expect(wordGardenMultiplier(4)).toBe(3);
    expect(wordGardenMultiplier(40)).toBe(3);
  });

  it('multiplies the base points of the word it lands on', () => {
    const puzzle = generateWordGarden(seededRng(3));
    const bloom = puzzle.words.find((word) => isWordGardenBloom(word, puzzle))!;
    expect(scoreWordGardenFind(bloom, puzzle, 0)).toEqual({ word: bloom, points: 13, multiplier: 1 });
    expect(scoreWordGardenFind(bloom, puzzle, 4)).toEqual({ word: bloom, points: 39, multiplier: 3 });
    expect(wordGardenPoints([find('a', 5), find('b', 10, 2)])).toBe(15);
  });
});

describe('growth stages and metadata', () => {
  const puzzle = { maxPoints: 100, fullBloomPoints: 70 };

  it('climbs the stages and points at the next bar', () => {
    expect(wordGardenStage(0, puzzle).name).toBe('Seed');
    expect(wordGardenStage(35, puzzle).name).toBe('Budding');
    expect(wordGardenStage(70, puzzle).name).toBe('Full bloom');
    expect(wordGardenStage(100, puzzle).name).toBe('Wild garden');
    expect(wordGardenNextStage(35, puzzle)).toEqual({ stage: { name: 'Blossoming', share: 0.5 }, points: 50 });
    expect(wordGardenNextStage(100, puzzle)).toBeNull();
  });

  it('treats full bloom as a perfect score and caps progress there', () => {
    expect(wordGardenScore(35, puzzle)).toBe(50);
    expect(wordGardenScore(70, puzzle)).toBe(100);
    expect(wordGardenScore(300, puzzle)).toBe(100);
    const board = generateWordGarden(seededRng(9));
    let streak = 0;
    const finds = board.words.map((word) => scoreWordGardenFind(word, board, streak++));
    const metadata = toWordGardenMetadata(board, finds, 120);
    expect(metadata.game).toBe('wordGarden');
    expect(metadata.correct).toBe(board.fullBloomPoints);
    expect(metadata.total).toBe(board.fullBloomPoints);
    expect(metadata.score).toBe(100);
    expect(metadata.rank).toBe('Wild garden');
    expect(metadata.wordsFound).toBe(board.words.length);
    expect(metadata.bestMultiplier).toBe(3);
    expect(metadata.letters).toHaveLength(WORD_GARDEN_LETTERS);
  });
});
