import { describe, expect, it } from 'vitest';
import {
  SPELLING_BEE_LETTERS,
  SPELLING_BEE_MIN_WORDS,
  generateSpellingBee,
  isSpellingBeePangram,
  judgeSpellingBeeWord,
  spellingBeeNextRank,
  spellingBeeRank,
  spellingBeeScore,
  spellingBeeWordPoints,
  toSpellingBeeMetadata,
} from './spellingBee';

const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

describe('generateSpellingBee', () => {
  it('builds a board of six distinct letters with at least one pangram and enough words', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const puzzle = generateSpellingBee(seededRng(seed));
      const letters = [puzzle.center, ...puzzle.outer];
      expect(letters).toHaveLength(SPELLING_BEE_LETTERS);
      expect(new Set(letters).size).toBe(SPELLING_BEE_LETTERS);
      expect(letters).not.toContain('s');
      expect(puzzle.words.length).toBeGreaterThanOrEqual(SPELLING_BEE_MIN_WORDS);
      expect(puzzle.pangramCount).toBeGreaterThanOrEqual(1);
      expect(puzzle.words.every((word) => word.includes(puzzle.center))).toBe(true);
      expect(puzzle.words.every((word) => word.split('').every((letter) => letters.includes(letter)))).toBe(true);
      expect(puzzle.maxPoints).toBeGreaterThan(0);
      expect(puzzle.geniusPoints).toBeLessThanOrEqual(puzzle.maxPoints);
    }
  });

  it('is repeatable for the same seed', () => {
    const a = generateSpellingBee(seededRng(5));
    const b = generateSpellingBee(seededRng(5));
    expect(a).toEqual(b);
  });
});

describe('judgeSpellingBeeWord', () => {
  const puzzle = generateSpellingBee(seededRng(3));
  const pangram = puzzle.words.find((word) => isSpellingBeePangram(word, puzzle))!;

  it('accepts a real word once and only once', () => {
    expect(judgeSpellingBeeWord(pangram.toUpperCase(), puzzle, [])).toBe('accepted');
    expect(judgeSpellingBeeWord(pangram, puzzle, [pangram])).toBe('already-found');
  });

  it('explains each way a word can fail', () => {
    expect(judgeSpellingBeeWord(puzzle.center.repeat(3), puzzle, [])).toBe('too-short');
    expect(judgeSpellingBeeWord(puzzle.outer[0]!.repeat(4), puzzle, [])).toBe('missing-center');
    expect(judgeSpellingBeeWord(`${puzzle.center}sss`, puzzle, [])).toBe('bad-letter');
    const bogus = `${puzzle.center}${puzzle.center}${puzzle.center}${puzzle.center}${puzzle.center}${puzzle.center}`;
    expect(puzzle.words).not.toContain(bogus);
    expect(judgeSpellingBeeWord(bogus, puzzle, [])).toBe('not-a-word');
  });

  it('scores four-letter words as one point and pangrams with the bonus', () => {
    const four = puzzle.words.find((word) => word.length === 4);
    if (four) expect(spellingBeeWordPoints(four, puzzle)).toBe(1);
    expect(spellingBeeWordPoints(pangram, puzzle)).toBe(6 + 7);
  });
});

describe('spelling bee ranks and metadata', () => {
  const puzzle = { maxPoints: 100, geniusPoints: 70 };

  it('climbs the ranks and points at the next bar', () => {
    expect(spellingBeeRank(0, puzzle).name).toBe('Beginner');
    expect(spellingBeeRank(40, puzzle).name).toBe('Great');
    expect(spellingBeeRank(70, puzzle).name).toBe('Genius');
    expect(spellingBeeRank(100, puzzle).name).toBe('Queen bee');
    expect(spellingBeeNextRank(40, puzzle)).toEqual({ rank: { name: 'Amazing', share: 0.5 }, points: 50 });
    expect(spellingBeeNextRank(100, puzzle)).toBeNull();
  });

  it('treats the genius bar as a perfect score and caps progress there', () => {
    expect(spellingBeeScore(35, puzzle)).toBe(50);
    expect(spellingBeeScore(70, puzzle)).toBe(100);
    expect(spellingBeeScore(100, puzzle)).toBe(100);
    const board = generateSpellingBee(seededRng(9));
    const metadata = toSpellingBeeMetadata(board, board.words, 120);
    expect(metadata.game).toBe('spellingBee');
    expect(metadata.correct).toBe(board.geniusPoints);
    expect(metadata.total).toBe(board.geniusPoints);
    expect(metadata.score).toBe(100);
    expect(metadata.rank).toBe('Queen bee');
    expect(metadata.wordsFound).toBe(board.words.length);
    expect(metadata.letters).toHaveLength(SPELLING_BEE_LETTERS);
  });
});
