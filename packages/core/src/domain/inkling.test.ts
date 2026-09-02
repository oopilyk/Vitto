import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INKLING_EPOCH,
  INKLING_GENERATOR_VERSION,
  INKLING_LENGTHS,
  INKLING_ROUNDS,
  findInklingEventForDate,
  generateInkling,
  inklingScore,
  inklingSolvedCount,
  inklingStreak,
  isValidGuess,
  markGuess,
  revealAnswer,
  toInklingMetadata,
} from './inkling';
import { INKLING_WORDS, INKLING_WORD_LENGTHS, type InklingWordLength } from '../data/inklingWords';
import type { BrainTrainingMetadata, HealthEvent, InklingRoundOutcome } from './health';

// ---------------------------------------------------------------------------
// Helpers. The mask decoder and the ordering check are written independently of
// the implementation on purpose: a test that reuses the code under test cannot
// catch that code being wrong.
// ---------------------------------------------------------------------------

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const SWEEP_DAYS = 1000;
const SWEEP_DATES = Array.from({ length: SWEEP_DAYS }, (_, day) => addDays(INKLING_EPOCH, day));

const sweepAnswers = (): string[][] =>
  SWEEP_DATES.map((date) => INKLING_LENGTHS.map((_, round) => revealAnswer(date, round)));

const decodeMask = (base64: string): Uint8Array => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64) {
    if (char === '=') break;
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
};

const eligibleWords = (length: InklingWordLength): Set<string> => {
  const { words, count, answerMask } = INKLING_WORDS[length];
  const mask = decodeMask(answerMask);
  const eligible = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    if ((mask[i >> 3]! & (0b1000_0000 >> (i & 7))) !== 0) {
      eligible.add(words.slice(i * length, i * length + length));
    }
  }
  return eligible;
};

const ELIGIBLE = new Map<InklingWordLength, Set<string>>(
  INKLING_WORD_LENGTHS.map((length) => [length, eligibleWords(length)] as const),
);

/** The retained build-time blocklist, read straight from the fixture. */
const blockedTerms = (): Set<string> => {
  const text = readFileSync(new URL('../data/offensiveWords.fixture.txt', import.meta.url), 'utf8');
  const terms = new Set<string>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().toLowerCase();
    if (!line || line.startsWith('#') || /^\[.*\]$/.test(line)) continue;
    terms.add(line);
  }
  return terms;
};

const outcome = (length: number, solved: boolean, guessesUsed: number): InklingRoundOutcome => ({
  length,
  solved,
  guessesUsed,
});

const brainEvent = (
  id: string,
  occurredAt: string,
  metadata: Partial<BrainTrainingMetadata>,
): HealthEvent => ({
  id,
  userId: 'user-1',
  occurredAt,
  type: 'BRAIN_TRAINING',
  source: 'manual',
  metadata: {
    game: 'inkling',
    correct: 5,
    total: 5,
    durationSeconds: 300,
    score: 100,
    ...metadata,
  } satisfies BrainTrainingMetadata,
});

// ---------------------------------------------------------------------------
// The wordlist data itself.
// ---------------------------------------------------------------------------

describe('inkling wordlist data', () => {
  it.each(INKLING_WORD_LENGTHS)('packs length %i as an exact multiple of the word length', (length) => {
    const { words, count } = INKLING_WORDS[length];
    expect(words.length).toBe(count * length);
    expect(words.length % length).toBe(0);
  });

  it.each(INKLING_WORD_LENGTHS)('keeps length %i strictly ASCII-ascending', (length) => {
    const { words, count } = INKLING_WORDS[length];
    let previous = '';
    for (let i = 0; i < count; i += 1) {
      const word = words.slice(i * length, i * length + length);
      expect(/^[a-z]+$/.test(word)).toBe(true);
      expect(previous < word).toBe(true);
      previous = word;
    }
  });

  it.each(INKLING_WORD_LENGTHS)('sizes the length %i answer mask to its word count', (length) => {
    const { count, answerCount, answerMask } = INKLING_WORDS[length];
    const mask = decodeMask(answerMask);
    expect(mask.length).toBe(Math.ceil(count / 8));
    expect(ELIGIBLE.get(length)!.size).toBe(answerCount);
    // No bits may be set in the tail padding past the final word.
    for (let i = count; i < mask.length * 8; i += 1) {
      expect(mask[i >> 3]! & (0b1000_0000 >> (i & 7))).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Generation.
// ---------------------------------------------------------------------------

describe('generateInkling', () => {
  /**
   * Pinned as a literal, NOT `toMatchSnapshot()`. An auto-updating snapshot would
   * absorb exactly the drift this guards against, and clients on different app
   * versions must agree on the day's board down to the last field.
   */
  it('matches the pinned board for 2026-09-01', () => {
    expect(generateInkling('2026-09-01')).toEqual({
      puzzleDate: '2026-09-01',
      generatorVersion: 1,
      rounds: [
        { index: 0, length: 4, maxGuesses: 4 },
        { index: 1, length: 5, maxGuesses: 5 },
        { index: 2, length: 5, maxGuesses: 5 },
        { index: 3, length: 6, maxGuesses: 6 },
        { index: 4, length: 6, maxGuesses: 6 },
      ],
    });
  });

  /** The other half of the same guarantee: the shape is worthless if the words drift. */
  it('matches the pinned answers for 2026-09-01 and for the epoch', () => {
    const answersFor = (date: string) => INKLING_LENGTHS.map((_, round) => revealAnswer(date, round));
    expect(answersFor('2026-09-01')).toEqual(['halo', 'liter', 'rocky', 'canvas', 'demean']);
    expect(answersFor(INKLING_EPOCH)).toEqual(['bulk', 'sweet', 'belch', 'viscid', 'wither']);
  });

  it('reports the generator version it was built with', () => {
    expect(generateInkling('2026-09-01').generatorVersion).toBe(INKLING_GENERATOR_VERSION);
    expect(generateInkling('2026-09-01').rounds).toHaveLength(INKLING_ROUNDS);
  });

  it('rejects a malformed or impossible date', () => {
    expect(() => generateInkling('2026-9-1')).toThrow();
    expect(() => generateInkling('not-a-date')).toThrow();
    expect(() => generateInkling('2026-02-30')).toThrow();
  });

  it('rejects a round index outside the ladder', () => {
    expect(() => revealAnswer('2026-09-01', -1)).toThrow();
    expect(() => revealAnswer('2026-09-01', INKLING_ROUNDS)).toThrow();
    expect(() => revealAnswer('2026-09-01', 1.5)).toThrow();
  });

  it('is deterministic across repeated calls', () => {
    expect(generateInkling('2026-09-01')).toEqual(generateInkling('2026-09-01'));
    for (let round = 0; round < INKLING_ROUNDS; round += 1) {
      expect(revealAnswer('2026-04-17', round)).toBe(revealAnswer('2026-04-17', round));
    }
  });

  it('produces an identical sweep when run twice', () => {
    expect(sweepAnswers()).toEqual(sweepAnswers());
  });

  it('still resolves dates before the epoch', () => {
    const before = INKLING_LENGTHS.map((_, round) => revealAnswer('2025-12-31', round));
    expect(before.map((word) => word.length)).toEqual([...INKLING_LENGTHS]);
    before.forEach((word) => expect(isValidGuess(word)).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// The 1,000-date sweep. These are the feature's real quality guarantee.
// ---------------------------------------------------------------------------

describe('the 1,000-date sweep', () => {
  const sweep = sweepAnswers();

  it('serves the same length ladder every day', () => {
    for (const day of sweep) {
      expect(day.map((word) => word.length)).toEqual([...INKLING_LENGTHS]);
    }
  });

  /**
   * The killer bug this exists to catch: an answer pool drifting out of the validity
   * list, producing a word of the day the player is forbidden from typing.
   */
  it('only ever serves an answer the player is allowed to guess', () => {
    const rejected: string[] = [];
    for (const day of sweep) {
      for (const word of day) if (!isValidGuess(word)) rejected.push(word);
    }
    expect(rejected).toEqual([]);
  });

  it('only ever serves an answer-eligible word', () => {
    const ineligible: string[] = [];
    for (const day of sweep) {
      for (const word of day) {
        if (!ELIGIBLE.get(word.length as InklingWordLength)?.has(word)) ineligible.push(word);
      }
    }
    expect(ineligible).toEqual([]);
  });

  it('never repeats a word within 365 days of itself', () => {
    const lastSeen = new Map<string, number>();
    const repeats: string[] = [];
    sweep.forEach((day, dayIndex) => {
      for (const word of day) {
        const previous = lastSeen.get(word);
        if (previous !== undefined && dayIndex - previous < 365) {
          repeats.push(`${word} on day ${previous} then day ${dayIndex}`);
        }
        lastSeen.set(word, dayIndex);
      }
    });
    expect(repeats).toEqual([]);
  });

  it('never serves a blocklisted term', () => {
    const blocked = blockedTerms();
    expect(blocked.size).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const day of sweep) {
      for (const word of day) if (blocked.has(word)) offenders.push(word);
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Guess validity.
// ---------------------------------------------------------------------------

describe('isValidGuess', () => {
  it('accepts real words of every supported length, case-insensitively', () => {
    expect(isValidGuess('halo')).toBe(true);
    expect(isValidGuess('HALO')).toBe(true);
    expect(isValidGuess('liter')).toBe(true);
    expect(isValidGuess('canvas')).toBe(true);
  });

  it('accepts the first and last word of each list', () => {
    for (const length of INKLING_WORD_LENGTHS) {
      const { words, count } = INKLING_WORDS[length];
      expect(isValidGuess(words.slice(0, length))).toBe(true);
      expect(isValidGuess(words.slice((count - 1) * length))).toBe(true);
    }
  });

  it('rejects non-words, wrong lengths and non-letters', () => {
    expect(isValidGuess('zzzz')).toBe(false);
    expect(isValidGuess('qqqqq')).toBe(false);
    expect(isValidGuess('cat')).toBe(false);
    expect(isValidGuess('elephant')).toBe(false);
    expect(isValidGuess('')).toBe(false);
    expect(isValidGuess('ha lo')).toBe(false);
    expect(isValidGuess('hal0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Marking. The duplicate-letter cases are the whole point.
// ---------------------------------------------------------------------------

describe('markGuess', () => {
  it('marks a plain guess with no repeated letters', () => {
    expect(markGuess('audio', 'audio')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
    expect(markGuess('fjord', 'aisle')).toEqual(['absent', 'absent', 'absent', 'absent', 'absent']);
  });

  it('never re-uses an answer letter already claimed by an exact match', () => {
    // THESE has two Es; both are matched exactly by GEESE, so the leading E of the
    // guess has nothing left to match and must read absent.
    expect(markGuess('geese', 'these')).toEqual(['absent', 'absent', 'correct', 'correct', 'correct']);
  });

  it('marks only as many duplicates as the answer actually has left', () => {
    // BASIS has two Ss; one is matched exactly, so of the two remaining guessed Ss
    // exactly one may be present and the other must be absent.
    expect(markGuess('sassy', 'basis')).toEqual(['present', 'correct', 'correct', 'absent', 'absent']);
  });

  it('handles a guess whose duplicates outnumber the answer', () => {
    // ALARM has two As and one L; LLAMA claims one L and one A exactly, leaving one A
    // and the M to be found out of place, and the second L with nothing to match.
    expect(markGuess('llama', 'alarm')).toEqual(['absent', 'correct', 'correct', 'present', 'present']);
  });

  it('marks both copies when the answer genuinely holds two', () => {
    // ERASE really does hold two unmatched Es, so both Es of SPEED are present.
    expect(markGuess('speed', 'erase')).toEqual(['present', 'absent', 'present', 'present', 'absent']);
  });

  it('marks a trailing duplicate absent when the single answer copy is already placed', () => {
    expect(markGuess('level', 'lever')).toEqual(['correct', 'correct', 'correct', 'correct', 'absent']);
  });

  it('is case-insensitive', () => {
    expect(markGuess('SASSY', 'Basis')).toEqual(markGuess('sassy', 'basis'));
  });

  it('marks every real answer of the day as fully correct against itself', () => {
    for (let round = 0; round < INKLING_ROUNDS; round += 1) {
      const answer = revealAnswer('2026-09-01', round);
      expect(markGuess(answer, answer).every((mark) => mark === 'correct')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Scoring: the engine gate and the display score are separate numbers.
// ---------------------------------------------------------------------------

describe('inklingScore', () => {
  it('awards the full 20 for solving within half the guess budget', () => {
    expect(inklingScore([outcome(4, true, 1)])).toBe(20);
    expect(inklingScore([outcome(4, true, 2)])).toBe(20);
    expect(inklingScore([outcome(5, true, 2)])).toBe(20);
    expect(inklingScore([outcome(6, true, 3)])).toBe(20);
  });

  it('awards 16 for solving with at least one guess to spare', () => {
    expect(inklingScore([outcome(4, true, 3)])).toBe(16);
    expect(inklingScore([outcome(5, true, 3)])).toBe(16);
    expect(inklingScore([outcome(5, true, 4)])).toBe(16);
    expect(inklingScore([outcome(6, true, 5)])).toBe(16);
  });

  it('awards 12 for solving on the final guess', () => {
    expect(inklingScore([outcome(4, true, 4)])).toBe(12);
    expect(inklingScore([outcome(5, true, 5)])).toBe(12);
    expect(inklingScore([outcome(6, true, 6)])).toBe(12);
  });

  it('awards nothing for an unsolved round, however many guesses were spent', () => {
    expect(inklingScore([outcome(5, false, 5)])).toBe(0);
    expect(inklingScore([outcome(5, false, 1)])).toBe(0);
  });

  it('tops out at 100 for a flawless day and bottoms at 0 for a blank one', () => {
    const flawless = [outcome(4, true, 2), outcome(5, true, 2), outcome(5, true, 1), outcome(6, true, 3), outcome(6, true, 2)];
    expect(inklingScore(flawless)).toBe(100);
    const blank = INKLING_LENGTHS.map((length) => outcome(length, false, length));
    expect(inklingScore(blank)).toBe(0);
    expect(inklingScore([])).toBe(0);
  });
});

describe('inklingSolvedCount', () => {
  it('counts solved rounds regardless of guesses used', () => {
    expect(
      inklingSolvedCount([
        outcome(4, true, 4),
        outcome(5, false, 5),
        outcome(5, true, 1),
        outcome(6, true, 6),
        outcome(6, true, 2),
      ]),
    ).toBe(4);
    expect(inklingSolvedCount([])).toBe(0);
  });
});

describe('toInklingMetadata', () => {
  const puzzle = generateInkling('2026-09-01');
  const fourOfFive = [
    outcome(4, true, 2),
    outcome(5, true, 5),
    outcome(5, false, 5),
    outcome(6, true, 4),
    outcome(6, true, 6),
  ];

  /** The pet engine gates `recovery: 4` on accuracy >= 0.8, so 4-of-5 must land exactly there. */
  it('puts 4-of-5 exactly on the sharp-session bar', () => {
    const metadata = toInklingMetadata(puzzle, fourOfFive, 480);
    expect(metadata.correct).toBe(4);
    expect(metadata.total).toBe(5);
    expect(metadata.correct / metadata.total).toBe(0.8);
  });

  it('carries the puzzle identity and the display score', () => {
    const metadata = toInklingMetadata(puzzle, fourOfFive, 480);
    expect(metadata.game).toBe('inkling');
    expect(metadata.durationSeconds).toBe(480);
    expect(metadata.puzzleDate).toBe('2026-09-01');
    expect(metadata.generatorVersion).toBe(INKLING_GENERATOR_VERSION);
    expect(metadata.score).toBe(inklingScore(fourOfFive));
    expect(metadata.score).toBe(20 + 12 + 0 + 16 + 12);
  });

  /** A player's own event history must never become a spoiler archive. */
  it('records no answers in roundOutcomes', () => {
    const metadata = toInklingMetadata(puzzle, fourOfFive, 480);
    expect(metadata.roundOutcomes).toHaveLength(5);
    for (const recorded of metadata.roundOutcomes!) {
      expect(Object.keys(recorded).sort()).toEqual(['guessesUsed', 'length', 'solved']);
    }
    const serialised = JSON.stringify(metadata);
    for (let round = 0; round < INKLING_ROUNDS; round += 1) {
      expect(serialised).not.toContain(revealAnswer('2026-09-01', round));
    }
  });

  it('does not alias the outcome objects it was handed', () => {
    const outcomes = [outcome(4, true, 2)];
    const metadata = toInklingMetadata(puzzle, outcomes, 60);
    expect(metadata.roundOutcomes![0]).not.toBe(outcomes[0]);
  });
});

// ---------------------------------------------------------------------------
// History and streaks.
// ---------------------------------------------------------------------------

describe('findInklingEventForDate', () => {
  const events: HealthEvent[] = [
    { id: 'steps', userId: 'user-1', occurredAt: '2026-08-28T09:00:00', type: 'STEP_ACTIVITY', source: 'manual', metadata: { steps: 900 } },
    brainEvent('math', '2026-08-28T10:00:00', { game: 'math', puzzleDate: '2026-08-28' }),
    brainEvent('inkling-28', '2026-08-28T11:00:00', { puzzleDate: '2026-08-28' }),
  ];

  it('finds the inkling event for the day', () => {
    expect(findInklingEventForDate(events, '2026-08-28')?.id).toBe('inkling-28');
  });

  it('ignores other games and other days', () => {
    expect(findInklingEventForDate(events, '2026-08-27')).toBeNull();
    expect(findInklingEventForDate([], '2026-08-28')).toBeNull();
  });
});

describe('inklingStreak', () => {
  const today = new Date(2026, 7, 28);

  it('counts consecutive puzzle dates', () => {
    const events = [
      brainEvent('a', '2026-08-26T09:00:00', { puzzleDate: '2026-08-26' }),
      brainEvent('b', '2026-08-27T09:00:00', { puzzleDate: '2026-08-27' }),
      brainEvent('c', '2026-08-28T09:00:00', { puzzleDate: '2026-08-28' }),
    ];
    expect(inklingStreak(events, today).currentStreak).toBe(3);
  });

  /**
   * The reason the keyOf hook exists: a session opened on the 28th and finished after
   * midnight still belongs to the 28th's puzzle.
   */
  it('credits the puzzle date, not the completion time, across midnight', () => {
    const events = [
      brainEvent('a', '2026-08-27T23:50:00', { puzzleDate: '2026-08-27' }),
      brainEvent('b', '2026-08-29T00:10:00', { puzzleDate: '2026-08-28' }),
    ];
    const summary = inklingStreak(events, today);
    expect(summary.activeDateKeys.has('2026-08-28')).toBe(true);
    expect(summary.activeDateKeys.has('2026-08-29')).toBe(false);
    expect(summary.currentStreak).toBe(2);
  });

  it('ignores other brain games and other event types', () => {
    const events = [
      brainEvent('math', '2026-08-28T09:00:00', { game: 'math', puzzleDate: '2026-08-28' }),
      { id: 'steps', userId: 'user-1', occurredAt: '2026-08-28T09:00:00', type: 'STEP_ACTIVITY', source: 'manual', metadata: { steps: 900 } } as HealthEvent,
    ];
    expect(inklingStreak(events, today).currentStreak).toBe(0);
  });

  it('tracks the longest streak alongside the current one', () => {
    const events = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-27', '2026-08-28'].map(
      (puzzleDate) => brainEvent(puzzleDate, `${puzzleDate}T09:00:00`, { puzzleDate }),
    );
    const summary = inklingStreak(events, today);
    expect(summary.longestStreak).toBe(4);
    expect(summary.currentStreak).toBe(2);
  });
});
