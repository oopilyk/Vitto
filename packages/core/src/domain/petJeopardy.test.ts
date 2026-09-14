import { describe, expect, test } from 'vitest';
import {
  JEOPARDY_PICKS_PER_ROUND,
  JEOPARDY_VALUES,
  type JeopardyCategory,
  type JeopardyGame,
  type JeopardyQuestion,
  answerJeopardyCell,
  answerJeopardyFinal,
  closeJeopardyReveal,
  completeJeopardy,
  createJeopardyGame,
  isValidJeopardyWager,
  jeopardyBoardXp,
  jeopardyCorrectCount,
  jeopardyMaxBoardPoints,
  jeopardyNetXp,
  jeopardyWagerDelta,
  maxJeopardyWager,
  openJeopardyCell,
  openJeopardyCellOf,
  setJeopardyWager,
  toJeopardyMetadata,
} from './petJeopardy';

const CATEGORIES: readonly JeopardyCategory[] = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
];

/** One question per (category, value) so a deal is fully determined and assertions can name cells. */
const pool: readonly JeopardyQuestion[] = CATEGORIES.flatMap((category) =>
  JEOPARDY_VALUES.map((value) => ({
    id: `${category.id}-${value}`,
    category: category.id,
    value,
    prompt: `${category.label} for ${value}?`,
    answers: [`right-${category.id}-${value}`, `wrong-a`, `wrong-b`],
  })),
);

const finalPool: readonly JeopardyQuestion[] = [
  { id: 'final-1', category: 'final', value: 0, prompt: 'Final?', answers: ['right-final', 'no-1', 'no-2'] },
];

/** Deterministic: always picks the first of any range, so shuffles are identity. */
const staticRng = () => 0;

const deal = (): JeopardyGame => createJeopardyGame({ categories: CATEGORIES, pool, finalPool }, staticRng);

/** What a round earns when every one of its picks lands correctly: alpha's three cells, in the
 *  fixed order `playRound` picks them (see below) — the sum of every value tier once each. */
const PERFECT_ROUND_XP = JEOPARDY_VALUES.reduce((total, value) => total + value, 0);

/** Index of the option that is the correct one for the currently open cell. */
const correctIndexOfOpen = (game: JeopardyGame): number => {
  const cell = openJeopardyCellOf(game);
  if (!cell) throw new Error('no open cell');
  return cell.correctIndex;
};

const wrongIndexOfOpen = (game: JeopardyGame): number => (correctIndexOfOpen(game) + 1) % 3;

/**
 * Plays exactly one round's worth of picks (`JEOPARDY_PICKS_PER_ROUND`), answering the first
 * `correctCount` of them correctly. Always picks whichever unplayed cell comes first in
 * `game.cells` (alpha-100, alpha-200, alpha-300 for this fixture's category order), so a given
 * `correctCount` always produces the same board points.
 */
const playRound = (start: JeopardyGame, correctCount: number): JeopardyGame => {
  let game = start;
  for (let played = 0; played < JEOPARDY_PICKS_PER_ROUND; played += 1) {
    const cell = game.cells.find((item) => !item.played);
    if (!cell) break;
    game = openJeopardyCell(game, cell.id);
    const index = played < correctCount ? correctIndexOfOpen(game) : wrongIndexOfOpen(game);
    game = answerJeopardyCell(game, index);
    game = closeJeopardyReveal(game);
  }
  return game;
};

describe('createJeopardyGame', () => {
  test('deals one cell per category and value pair', () => {
    // Arrange / Act
    const game = deal();

    // Assert
    expect(game.cells).toHaveLength(CATEGORIES.length * JEOPARDY_VALUES.length);
    for (const category of CATEGORIES) {
      for (const value of JEOPARDY_VALUES) {
        const cell = game.cells.find((item) => item.categoryId === category.id && item.value === value);
        expect(cell).toBeDefined();
        expect(cell?.played).toBe(false);
      }
    }
  });

  test('starts on the board with nothing open, nothing scored and no wager', () => {
    const game = deal();

    expect(game.status).toBe('board');
    expect(game.openCellId).toBeNull();
    expect(game.boardPoints).toBe(0);
    expect(game.wager).toBeNull();
    expect(game.final).toBeNull();
  });

  test('gives every cell three options including exactly one correct answer', () => {
    const game = deal();

    for (const cell of game.cells) {
      expect(cell.options).toHaveLength(3);
      expect(new Set(cell.options).size).toBe(3);
      expect(cell.options[cell.correctIndex]).toBe(cell.question.answers[0]);
    }
  });

  test('throws when the board pool is empty', () => {
    expect(() => createJeopardyGame({ categories: CATEGORIES, pool: [], finalPool }, staticRng)).toThrow(
      /no questions/i,
    );
  });

  test('throws when a category and value pair has no question at all', () => {
    // Arrange: drop every 300 question for beta, leaving a hole in the board.
    const holed = pool.filter((question) => !(question.category === 'beta' && question.value === 300));

    // Act / Assert
    expect(() => createJeopardyGame({ categories: CATEGORIES, pool: holed, finalPool }, staticRng)).toThrow(
      /beta/i,
    );
  });

  test('throws when a question is malformed with the wrong number of answers', () => {
    const malformed = pool.map((question) =>
      question.id === 'alpha-100' ? { ...question, answers: ['only-one'] } : question,
    );

    expect(() =>
      createJeopardyGame({ categories: CATEGORIES, pool: malformed, finalPool }, staticRng),
    ).toThrow(/alpha-100/);
  });

  test('throws when the final pool is empty', () => {
    expect(() =>
      createJeopardyGame({ categories: CATEGORIES, pool, finalPool: [] }, staticRng),
    ).toThrow(/final/i);
  });
});

describe('openJeopardyCell', () => {
  test('opens an unplayed cell and moves to the question', () => {
    const game = deal();

    const opened = openJeopardyCell(game, game.cells[0].id);

    expect(opened.status).toBe('question');
    expect(opened.openCellId).toBe(game.cells[0].id);
  });

  test('returns the same reference for an unknown cell id', () => {
    const game = deal();

    expect(openJeopardyCell(game, 'nope')).toBe(game);
  });

  test('returns the same reference when a cell is already open', () => {
    const game = openJeopardyCell(deal(), 'alpha-100');

    expect(openJeopardyCell(game, 'alpha-200')).toBe(game);
  });

  test('refuses to reopen a played cell, so a square can never be replayed', () => {
    // Arrange: play alpha-100 through to the board.
    let game = openJeopardyCell(deal(), 'alpha-100');
    game = answerJeopardyCell(game, correctIndexOfOpen(game));
    game = closeJeopardyReveal(game);
    expect(game.status).toBe('board');

    // Act
    const reopened = openJeopardyCell(game, 'alpha-100');

    // Assert
    expect(reopened).toBe(game);
  });

  test('refuses to open a further cell once the round has used up its picks, even though squares remain', () => {
    // Arrange: a round always leaves cells unplayed — three picks out of six here.
    const game = playRound(deal(), JEOPARDY_PICKS_PER_ROUND);
    const untouched = game.cells.find((cell) => !cell.played);
    expect(untouched).toBeDefined();

    // Act
    const reopened = openJeopardyCell(game, untouched!.id);

    // Assert: refused by reference, exactly like reopening an already-played cell.
    expect(reopened).toBe(game);
  });
});

describe('answerJeopardyCell', () => {
  test('a correct answer banks the cell value and reveals', () => {
    const game = openJeopardyCell(deal(), 'alpha-200');

    const answered = answerJeopardyCell(game, correctIndexOfOpen(game));

    expect(answered.status).toBe('revealing');
    expect(answered.boardPoints).toBe(200);
    const cell = answered.cells.find((item) => item.id === 'alpha-200');
    expect(cell?.played).toBe(true);
    expect(cell?.correct).toBe(true);
  });

  test('a wrong answer marks the cell played and banks nothing', () => {
    const game = openJeopardyCell(deal(), 'alpha-200');

    const answered = answerJeopardyCell(game, wrongIndexOfOpen(game));

    expect(answered.status).toBe('revealing');
    expect(answered.boardPoints).toBe(0);
    const cell = answered.cells.find((item) => item.id === 'alpha-200');
    expect(cell?.played).toBe(true);
    expect(cell?.correct).toBe(false);
    expect(cell?.chosenIndex).toBe(wrongIndexOfOpen(game));
  });

  test('a second answer is refused by reference, so rapid taps cannot double score', () => {
    const game = openJeopardyCell(deal(), 'alpha-300');
    const answered = answerJeopardyCell(game, correctIndexOfOpen(game));

    // Act: the user keeps tapping during the reveal.
    const again = answerJeopardyCell(answered, correctIndexOfOpen(game));
    const andAgain = answerJeopardyCell(again, wrongIndexOfOpen(game));

    // Assert
    expect(again).toBe(answered);
    expect(andAgain).toBe(answered);
    expect(answered.boardPoints).toBe(300);
  });

  test('an answer cannot change after submitting', () => {
    const game = openJeopardyCell(deal(), 'alpha-100');
    const answered = answerJeopardyCell(game, correctIndexOfOpen(game));

    const changed = answerJeopardyCell(answered, wrongIndexOfOpen(game));

    expect(changed).toBe(answered);
    expect(changed.cells.find((cell) => cell.id === 'alpha-100')?.correct).toBe(true);
  });

  test('returns the same reference when no cell is open', () => {
    const game = deal();

    expect(answerJeopardyCell(game, 0)).toBe(game);
  });

  test('returns the same reference for an out of range option index', () => {
    const game = openJeopardyCell(deal(), 'alpha-100');

    expect(answerJeopardyCell(game, 3)).toBe(game);
    expect(answerJeopardyCell(game, -1)).toBe(game);
    expect(answerJeopardyCell(game, 1.5)).toBe(game);
  });
});

describe('closeJeopardyReveal', () => {
  test('returns to the board while picks remain', () => {
    let game = openJeopardyCell(deal(), 'alpha-100');
    game = answerJeopardyCell(game, correctIndexOfOpen(game));

    const closed = closeJeopardyReveal(game);

    expect(closed.status).toBe('board');
    expect(closed.openCellId).toBeNull();
  });

  test("moves to the wager once the round's picks are used up", () => {
    const game = playRound(deal(), JEOPARDY_PICKS_PER_ROUND);

    expect(game.status).toBe('wager');
    expect(game.cells.filter((cell) => cell.played)).toHaveLength(JEOPARDY_PICKS_PER_ROUND);
    // Not the whole board: a round leaves squares on the table.
    expect(game.cells.some((cell) => !cell.played)).toBe(true);
  });

  test('is a no-op outside a reveal, so a stray timer cannot skip a question', () => {
    const onQuestion = openJeopardyCell(deal(), 'alpha-100');
    const onBoard = deal();

    expect(closeJeopardyReveal(onQuestion)).toBe(onQuestion);
    expect(closeJeopardyReveal(onBoard)).toBe(onBoard);
  });
});

describe('wager validation', () => {
  test('caps the wager at exactly what the round earned, nothing more', () => {
    const game = playRound(deal(), 2);

    expect(maxJeopardyWager(game)).toBe(game.boardPoints);
    expect(maxJeopardyWager(game)).toBe(300); // alpha-100 + alpha-200
  });

  test('offers nothing to wager when the round earned nothing', () => {
    const game = playRound(deal(), 0);

    expect(maxJeopardyWager(game)).toBe(0);
  });

  test('accepts whole numbers inside the range, including both ends', () => {
    expect(isValidJeopardyWager(0, 20)).toBe(true);
    expect(isValidJeopardyWager(20, 20)).toBe(true);
    expect(isValidJeopardyWager(7, 20)).toBe(true);
  });

  test('rejects anything outside the range or not a whole number', () => {
    expect(isValidJeopardyWager(-1, 20)).toBe(false);
    expect(isValidJeopardyWager(21, 20)).toBe(false);
    expect(isValidJeopardyWager(1.5, 20)).toBe(false);
    expect(isValidJeopardyWager(Number.NaN, 20)).toBe(false);
    expect(isValidJeopardyWager(Number.POSITIVE_INFINITY, 20)).toBe(false);
  });

  test('setJeopardyWager refuses an invalid wager by reference', () => {
    const game = playRound(deal(), JEOPARDY_PICKS_PER_ROUND);
    const max = maxJeopardyWager(game);

    expect(setJeopardyWager(game, max + 1)).toBe(game);
    expect(setJeopardyWager(game, -1)).toBe(game);
    expect(setJeopardyWager(game, 2.5)).toBe(game);
    expect(setJeopardyWager(game, Number.NaN)).toBe(game);
  });

  test('setJeopardyWager accepts a valid wager and deals the final question', () => {
    const game = playRound(deal(), JEOPARDY_PICKS_PER_ROUND);

    const wagered = setJeopardyWager(game, 10);

    expect(wagered.status).toBe('final');
    expect(wagered.wager).toBe(10);
    expect(wagered.final?.question.id).toBe('final-1');
    expect(wagered.final?.options).toHaveLength(3);
  });

  test('a second wager is refused, so the stake cannot be raised after seeing the question', () => {
    const wagered = setJeopardyWager(playRound(deal(), JEOPARDY_PICKS_PER_ROUND), 10);

    expect(setJeopardyWager(wagered, 0)).toBe(wagered);
  });

  test('setJeopardyWager is a no-op before the board is finished', () => {
    const game = deal();

    expect(setJeopardyWager(game, 0)).toBe(game);
  });
});

describe('final jeopardy', () => {
  const toFinal = (correctCount: number, wager: number): JeopardyGame =>
    setJeopardyWager(playRound(deal(), correctCount), wager);

  test('a correct final adds the wager to the session', () => {
    const game = toFinal(JEOPARDY_PICKS_PER_ROUND, 20);

    const answered = answerJeopardyFinal(game, game.final?.correctIndex ?? 0);

    expect(answered.status).toBe('finalRevealing');
    expect(answered.final?.correct).toBe(true);
    expect(jeopardyWagerDelta(answered)).toBe(20);
  });

  test('a wrong final subtracts the wager from the session', () => {
    const game = toFinal(JEOPARDY_PICKS_PER_ROUND, 20);
    const wrong = ((game.final?.correctIndex ?? 0) + 1) % 3;

    const answered = answerJeopardyFinal(game, wrong);

    expect(answered.final?.correct).toBe(false);
    expect(jeopardyWagerDelta(answered)).toBe(-20);
  });

  test('a second final answer is refused by reference', () => {
    const game = toFinal(JEOPARDY_PICKS_PER_ROUND, 20);
    const answered = answerJeopardyFinal(game, game.final?.correctIndex ?? 0);

    expect(answerJeopardyFinal(answered, 1)).toBe(answered);
  });

  test('rejects an out of range final option', () => {
    const game = toFinal(JEOPARDY_PICKS_PER_ROUND, 20);

    expect(answerJeopardyFinal(game, 3)).toBe(game);
    expect(answerJeopardyFinal(game, -1)).toBe(game);
  });

  test('completes only from the final reveal', () => {
    const game = toFinal(JEOPARDY_PICKS_PER_ROUND, 5);
    const answered = answerJeopardyFinal(game, game.final?.correctIndex ?? 0);

    expect(completeJeopardy(game)).toBe(game);

    const done = completeJeopardy(answered);
    expect(done.status).toBe('complete');
    expect(completeJeopardy(done)).toBe(done);
  });

  test('an unanswered final contributes nothing either way', () => {
    const game = toFinal(JEOPARDY_PICKS_PER_ROUND, 30);

    expect(jeopardyWagerDelta(game)).toBe(0);
  });
});

describe('xp and points accounting', () => {
  test('a board with nothing answered earns no xp at all', () => {
    const game = deal();

    expect(jeopardyBoardXp(game)).toBe(0);
    expect(jeopardyNetXp(game)).toBe(0);
  });

  test('a wrong answer earns no board xp — only a won square pays', () => {
    let game = openJeopardyCell(deal(), 'alpha-100');
    game = answerJeopardyCell(game, wrongIndexOfOpen(game));

    expect(jeopardyBoardXp(game)).toBe(0);
  });

  test('a correct answer earns exactly its face value, one to one', () => {
    let game = openJeopardyCell(deal(), 'alpha-200');
    game = answerJeopardyCell(game, correctIndexOfOpen(game));

    expect(jeopardyBoardXp(game)).toBe(200);
  });

  test('a perfect round earns the sum of its picks, exactly', () => {
    const game = playRound(deal(), JEOPARDY_PICKS_PER_ROUND);

    expect(jeopardyBoardXp(game)).toBe(PERFECT_ROUND_XP);
  });

  test("the theoretical max is the round's picks, all at the top value", () => {
    expect(jeopardyMaxBoardPoints()).toBe(JEOPARDY_PICKS_PER_ROUND * Math.max(...JEOPARDY_VALUES));
  });

  test('board xp rises with how many picks were correct', () => {
    const scores = [0, 1, 2, 3].map((count) => jeopardyBoardXp(playRound(deal(), count)));

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeGreaterThanOrEqual(scores[index - 1]);
    }
    expect(scores[0]).toBe(0);
    expect(scores[JEOPARDY_PICKS_PER_ROUND]).toBe(PERFECT_ROUND_XP);
  });

  test('a won final adds its wager to the net', () => {
    const game = setJeopardyWager(playRound(deal(), JEOPARDY_PICKS_PER_ROUND), 15);
    const won = completeJeopardy(answerJeopardyFinal(game, game.final?.correctIndex ?? 0));

    expect(jeopardyNetXp(won)).toBe(PERFECT_ROUND_XP + 15);
  });

  test('a lost final subtracts its wager from the net', () => {
    const game = setJeopardyWager(playRound(deal(), JEOPARDY_PICKS_PER_ROUND), 15);
    const wrong = ((game.final?.correctIndex ?? 0) + 1) % 3;
    const lost = completeJeopardy(answerJeopardyFinal(game, wrong));

    expect(jeopardyNetXp(lost)).toBe(PERFECT_ROUND_XP - 15);
  });

  test('net xp floors at zero even after wagering everything earned and losing', () => {
    // Arrange: one won square, then the whole of it staked and lost.
    const board = playRound(deal(), 1);
    const game = setJeopardyWager(board, maxJeopardyWager(board));
    const wrong = ((game.final?.correctIndex ?? 0) + 1) % 3;

    // Act
    const lost = completeJeopardy(answerJeopardyFinal(game, wrong));

    // Assert: losing the whole wager cannot take the session below zero.
    expect(jeopardyWagerDelta(lost)).toBe(-maxJeopardyWager(board));
    expect(jeopardyNetXp(lost)).toBe(0);
  });

  test('counts correct answers across the board and the final', () => {
    const board = playRound(deal(), 2);
    expect(jeopardyCorrectCount(board)).toBe(2);

    const game = setJeopardyWager(board, 5);
    const won = answerJeopardyFinal(game, game.final?.correctIndex ?? 0);
    expect(jeopardyCorrectCount(won)).toBe(3);
  });
});

describe('toJeopardyMetadata', () => {
  test('reports the full session and stamps the exact xp the engine must award', () => {
    const board = playRound(deal(), JEOPARDY_PICKS_PER_ROUND);
    const game = setJeopardyWager(board, 12);
    const done = completeJeopardy(answerJeopardyFinal(game, game.final?.correctIndex ?? 0));

    const metadata = toJeopardyMetadata(done, 95);

    expect(metadata.game).toBe('petJeopardy');
    expect(metadata.correct).toBe(JEOPARDY_PICKS_PER_ROUND + 1);
    expect(metadata.total).toBe(JEOPARDY_PICKS_PER_ROUND + 1);
    expect(metadata.durationSeconds).toBe(95);
    expect(metadata.points).toBe(done.boardPoints);
    expect(metadata.maxPoints).toBe(jeopardyMaxBoardPoints());
    expect(metadata.xpAwarded).toBe(jeopardyNetXp(done));
    expect(metadata.score).toBe(100);
  });

  test('a game left after two squares is scored on what was actually played', () => {
    let game = openJeopardyCell(deal(), 'alpha-100');
    game = closeJeopardyReveal(answerJeopardyCell(game, correctIndexOfOpen(game)));
    game = openJeopardyCell(game, 'alpha-200');
    game = closeJeopardyReveal(answerJeopardyCell(game, wrongIndexOfOpen(game)));

    const metadata = toJeopardyMetadata(game, 20);

    expect(metadata.total).toBe(2);
    expect(metadata.correct).toBe(1);
    expect(metadata.score).toBe(50);
    expect(metadata.xpAwarded).toBe(jeopardyNetXp(game));
  });

  test('never reports a duration below one second', () => {
    const metadata = toJeopardyMetadata(deal(), 0.2);

    expect(metadata.durationSeconds).toBe(1);
  });
});

describe('immutability', () => {
  test('no transition mutates the game it was handed', () => {
    const game = deal();
    const snapshot = JSON.stringify(game);

    const opened = openJeopardyCell(game, 'alpha-100');
    const answered = answerJeopardyCell(opened, correctIndexOfOpen(opened));
    closeJeopardyReveal(answered);

    expect(JSON.stringify(game)).toBe(snapshot);
  });
});
