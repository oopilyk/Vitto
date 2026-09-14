import type { BrainTrainingMetadata } from './health';

/**
 * Pet Jeopardy: a small trivia board — categories across the top, rising xp
 * values down the side — followed by one Final Jeopardy question the player
 * wagers real pet xp on.
 *
 * Everything here is pure and rng-injectable, exactly as `fourCorners.ts` is:
 * the screen owns the clock, the animation and the single award call, this owns
 * the game. Every transition below returns the game **unchanged and identical by
 * reference** when called out of turn, and that reference check is the entire
 * anti-double-submit story — there is not a single boolean guard flag in here.
 *
 * ## The board pays real xp, one to one, but only for {@link JEOPARDY_PICKS_PER_ROUND} squares
 *
 * The board's 100/200/300 values ARE the xp awarded — there is no separate
 * points currency and no formula that scales them down. What keeps that from
 * blowing out the pet's economy is that a round only ever plays
 * {@link JEOPARDY_PICKS_PER_ROUND} of the board's nine squares: reach for the
 * high-value squares and you are risking not getting to play the easy ones,
 * exactly the tension a real Jeopardy board has. `points`/`maxPoints` on
 * `BrainTrainingMetadata` still carry the board's own score for the care diary
 * and mind streaks (the same role `FOUR_CORNERS_POINTS_CORRECT` plays for Four
 * Corners) — they are just the same numbers as the xp now rather than a
 * separate scale.
 *
 * Real xp is then {@link jeopardyNetXp}, handed to the engine through the
 * explicit `xpAwarded` override on the metadata rather than being re-derived
 * there.
 */

export interface JeopardyCategory {
  id: string;
  label: string;
}

/**
 * The board's value ladder, low to high. Three tiers rather than the usual four:
 * a round has to stay inside the minute-or-two that every other Vitto mind game
 * fits in, and three categories by three values plus the final is already ten
 * questions. Difficulty is expected to rise with the value — see the authoring
 * rules in `data/jeopardyQuestions.ts`.
 */
export const JEOPARDY_VALUES = [100, 200, 300] as const;
export type JeopardyValue = (typeof JEOPARDY_VALUES)[number];

/**
 * How many of the board's nine squares one round actually plays. Not all of
 * them: since the board now pays its face value as real xp, letting a player
 * clear all nine would pay out far more than any other Vitto mind session for
 * the same few minutes. Picking only three also *is* the game's decision —
 * reach for a 300 early and there may not be a turn left to fall back on an
 * easy 100.
 */
export const JEOPARDY_PICKS_PER_ROUND = 3;

/** Exactly three choices per question — the shape the answer tiles are built for. */
export const JEOPARDY_OPTION_COUNT = 3;

export interface JeopardyQuestion {
  id: string;
  /** A category id from the board's category list, or `'final'` for the final pool. */
  category: string;
  /** Which board tier this belongs to. Final questions carry 0 and are never placed on the board. */
  value: JeopardyValue | 0;
  prompt: string;
  /**
   * Exactly {@link JEOPARDY_OPTION_COUNT} answers, **correct one first**.
   * Authoring order, not display order: the deal shuffles them onto the tiles,
   * so the data file never thinks about layout and a reader can see the answer
   * at a glance.
   */
  answers: readonly string[];
}

export interface JeopardyCell {
  /** Stable within a game: `${categoryId}-${value}`. What the screen taps with. */
  id: string;
  categoryId: string;
  value: JeopardyValue;
  question: JeopardyQuestion;
  /** The question's answers, shuffled for this game. */
  options: readonly string[];
  correctIndex: number;
  played: boolean;
  /** Null until played. */
  correct: boolean | null;
  chosenIndex: number | null;
}

export interface JeopardyFinal {
  question: JeopardyQuestion;
  options: readonly string[];
  correctIndex: number;
  chosenIndex: number | null;
  correct: boolean | null;
}

/**
 * `board` — choosing a square. `question` — a square is open, waiting on a tap.
 * `revealing` — answered, feedback on screen, further taps ignored. `wager` —
 * the round's picks are used up, setting the stake. `final` — the last question is up.
 * `finalRevealing` — the final is answered. `complete` — results.
 *
 * The status is what makes rapid multi-tapping a no-op rather than a double
 * score: every transition below refuses anything that is not its own status.
 */
export type JeopardyStatus =
  | 'board'
  | 'question'
  | 'revealing'
  | 'wager'
  | 'final'
  | 'finalRevealing'
  | 'complete';

export interface JeopardyGame {
  categories: readonly JeopardyCategory[];
  cells: readonly JeopardyCell[];
  status: JeopardyStatus;
  /** Which cell the open question belongs to, or null whenever none is open. */
  openCellId: string | null;
  /** Board points banked so far — the sum of the values actually won. Also this round's real xp. */
  boardPoints: number;
  wager: number | null;
  /**
   * Drawn at deal time but held back until the wager is set, so the player can
   * never see the question they are about to bet on before betting on it.
   */
  finalQuestion: JeopardyQuestion;
  final: JeopardyFinal | null;
}

type Rng = () => number;

/** Fisher-Yates on a copy — the caller's array is never touched. */
const shuffle = <T,>(items: readonly T[], rng: Rng): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

const cellId = (categoryId: string, value: JeopardyValue): string => `${categoryId}-${value}`;

/** Shuffles a question's answers and records where the correct one landed. */
const place = (question: JeopardyQuestion, rng: Rng): { options: readonly string[]; correctIndex: number } => {
  if (question.answers.length !== JEOPARDY_OPTION_COUNT) {
    throw new Error(`Question "${question.id}" needs exactly ${JEOPARDY_OPTION_COUNT} answers.`);
  }
  const options = shuffle(question.answers, rng);
  return { options, correctIndex: options.indexOf(question.answers[0]) };
};

export interface JeopardyDeal {
  categories: readonly JeopardyCategory[];
  /** Board questions. Must cover every category and value pair at least once. */
  pool: readonly JeopardyQuestion[];
  /** Final Jeopardy questions, drawn from separately. */
  finalPool: readonly JeopardyQuestion[];
}

/**
 * Deals a board: one question per category and value pair, each with its answers
 * shuffled across the three tiles, plus one final question held back.
 *
 * Throws rather than returning a hollow board, so a missing or malformed data
 * file surfaces as one clear message at the top of the screen instead of a game
 * with a hole in it that silently scores nothing.
 */
export const createJeopardyGame = (deal: JeopardyDeal, rng: Rng = Math.random): JeopardyGame => {
  const { categories, pool, finalPool } = deal;
  if (pool.length === 0) throw new Error('No questions are available for the board right now.');
  if (finalPool.length === 0) throw new Error('No Final Jeopardy question is available right now.');
  if (categories.length === 0) throw new Error('No categories are available for the board right now.');

  const cells = categories.flatMap((category) =>
    JEOPARDY_VALUES.map((value) => {
      const candidates = pool.filter(
        (question) => question.category === category.id && question.value === value,
      );
      if (candidates.length === 0) {
        throw new Error(`No ${value} question is available for ${category.label}.`);
      }
      const question = shuffle(candidates, rng)[0];
      const { options, correctIndex } = place(question, rng);
      return {
        id: cellId(category.id, value),
        categoryId: category.id,
        value,
        question,
        options,
        correctIndex,
        played: false,
        correct: null,
        chosenIndex: null,
      } satisfies JeopardyCell;
    }),
  );

  return {
    categories,
    cells,
    status: 'board',
    openCellId: null,
    boardPoints: 0,
    wager: null,
    finalQuestion: shuffle(finalPool, rng)[0],
    final: null,
  };
};

export const openJeopardyCellOf = (game: JeopardyGame): JeopardyCell | null =>
  game.cells.find((cell) => cell.id === game.openCellId) ?? null;

/** The best a round can possibly score: its picks, all at the top value. */
export const jeopardyMaxBoardPoints = (): number =>
  JEOPARDY_PICKS_PER_ROUND * Math.max(...JEOPARDY_VALUES);

const isOptionIndex = (index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < JEOPARDY_OPTION_COUNT;

/**
 * Opens a square. Returns the game **unchanged and identical by reference**
 * unless it is sitting on the board and the square is real and unplayed — which
 * is what makes replaying a square structurally impossible rather than merely
 * discouraged.
 */
export const openJeopardyCell = (game: JeopardyGame, id: string): JeopardyGame => {
  if (game.status !== 'board') return game;
  const cell = game.cells.find((item) => item.id === id);
  if (!cell || cell.played) return game;
  return { ...game, status: 'question', openCellId: id };
};

/**
 * Locks in the tapped answer. A no-op in any status but `question`, so a second
 * tap during the reveal cannot score twice, and the answer cannot be changed
 * once submitted.
 */
export const answerJeopardyCell = (game: JeopardyGame, optionIndex: number): JeopardyGame => {
  if (game.status !== 'question' || !isOptionIndex(optionIndex)) return game;
  const open = openJeopardyCellOf(game);
  if (!open) return game;

  const correct = optionIndex === open.correctIndex;
  return {
    ...game,
    cells: game.cells.map((cell) =>
      cell.id === open.id ? { ...cell, played: true, correct, chosenIndex: optionIndex } : cell,
    ),
    boardPoints: game.boardPoints + (correct ? open.value : 0),
    status: 'revealing',
  };
};

/**
 * Moves past the reveal — back to the board, or on to the wager once the round
 * has used up its picks. A no-op in any other status, so a stray timer firing
 * after the user has already left cannot skip a question.
 */
export const closeJeopardyReveal = (game: JeopardyGame): JeopardyGame => {
  if (game.status !== 'revealing') return game;
  const boardDone = jeopardyPlayedCells(game).length >= JEOPARDY_PICKS_PER_ROUND;
  return { ...game, status: boardDone ? 'wager' : 'board', openCellId: null };
};

/**
 * The most this player may stake: exactly what the board paid out this round,
 * never more. A wager is risk on top of what was actually earned just now, not
 * a line of credit against the pet's history — so losing it can only ever cost
 * this session's own xp.
 */
export const maxJeopardyWager = (game: JeopardyGame): number => game.boardPoints;

/**
 * A wager must be a whole number of xp inside `[0, max]`. Exported so the screen
 * can disable its confirm button on exactly the rule the transition enforces,
 * rather than a second copy of it that could drift.
 */
export const isValidJeopardyWager = (amount: number, max: number): boolean =>
  Number.isInteger(amount) && amount >= 0 && amount <= max;

/**
 * Locks the stake in and deals the final question. Refused by reference for an
 * invalid amount, and refused again once a wager is already set — so the stake
 * can never be raised after the question has been seen.
 */
export const setJeopardyWager = (game: JeopardyGame, amount: number, rng: Rng = Math.random): JeopardyGame => {
  if (game.status !== 'wager') return game;
  if (!isValidJeopardyWager(amount, maxJeopardyWager(game))) return game;
  if (!game.finalQuestion) return game;

  const { options, correctIndex } = place(game.finalQuestion, rng);
  return {
    ...game,
    status: 'final',
    wager: amount,
    final: { question: game.finalQuestion, options, correctIndex, chosenIndex: null, correct: null },
  };
};

/** Locks in the final answer. A no-op once answered, so the result cannot be re-rolled. */
export const answerJeopardyFinal = (game: JeopardyGame, optionIndex: number): JeopardyGame => {
  if (game.status !== 'final' || !game.final || !isOptionIndex(optionIndex)) return game;
  const correct = optionIndex === game.final.correctIndex;
  return {
    ...game,
    status: 'finalRevealing',
    final: { ...game.final, chosenIndex: optionIndex, correct },
  };
};

/** Moves from the final's reveal to the results. A no-op anywhere else. */
export const completeJeopardy = (game: JeopardyGame): JeopardyGame =>
  game.status === 'finalRevealing' ? { ...game, status: 'complete' } : game;

export const jeopardyPlayedCells = (game: JeopardyGame): readonly JeopardyCell[] =>
  game.cells.filter((cell) => cell.played);

/** Correct answers across the board and, once answered, the final. */
export const jeopardyCorrectCount = (game: JeopardyGame): number =>
  jeopardyPlayedCells(game).filter((cell) => cell.correct).length + (game.final?.correct ? 1 : 0);

/** Questions actually answered, the final included once it has been. */
export const jeopardyAnsweredCount = (game: JeopardyGame): number => {
  const finalAnswered = game.final !== null && game.final.chosenIndex !== null;
  return jeopardyPlayedCells(game).length + (finalAnswered ? 1 : 0);
};

/**
 * Real xp earned from the board alone — literally `boardPoints`. There is no
 * separate formula: a won square pays its face value, one to one, and a round
 * is capped at {@link JEOPARDY_PICKS_PER_ROUND} picks specifically so that this
 * can be true without breaking the pet's economy. Kept as its own named
 * function (rather than every caller reading `game.boardPoints` directly)
 * because the results screen and the wager panel both want to call this "the
 * board's xp" and that name should live in one place.
 */
export const jeopardyBoardXp = (game: JeopardyGame): number => game.boardPoints;

/** What the final did to the session: +wager, -wager, or nothing if it was never answered. */
export const jeopardyWagerDelta = (game: JeopardyGame): number => {
  if (!game.final || game.final.correct === null || game.wager === null) return 0;
  return game.final.correct ? game.wager : -game.wager;
};

/**
 * The xp this whole session is worth — the one number the engine will award.
 *
 * **Floored at zero, and that floor is load-bearing.** `applyDelta` computes the
 * stored xp as `nextXp % XP_PER_LEVEL`, which in JavaScript returns a *negative*
 * remainder for a negative operand, so a negative xp delta would write an
 * impossible `xp` onto the pet and walk its level backwards. Clamping the
 * session here means a lost wager can cost a player everything they earned this
 * sitting and not one point more, and no negative delta ever reaches the engine.
 */
export const jeopardyNetXp = (game: JeopardyGame): number =>
  Math.max(0, jeopardyBoardXp(game) + jeopardyWagerDelta(game));

/** 0-100 accuracy over the questions actually answered. */
export const jeopardyScore = (game: JeopardyGame): number => {
  const answered = jeopardyAnsweredCount(game);
  if (answered === 0) return 0;
  return Math.round((jeopardyCorrectCount(game) / answered) * 100);
};

/**
 * The session as a `BRAIN_TRAINING` event's metadata — the same shape every
 * other mind game records, so the pet engine, care diary and mind streaks pick
 * it up with no special cases.
 *
 * `total` is the questions answered rather than the questions dealt, so a game
 * left early reads as "2 of 2" and is scored on what the user actually did.
 * `xpAwarded` is the explicit override: this is the one game whose xp is decided
 * by the session (the wager is a player choice, not a formula over accuracy), so
 * it states the figure rather than letting `brainTrainingXp` re-derive one.
 */
export const toJeopardyMetadata = (
  game: JeopardyGame,
  durationSeconds: number,
): BrainTrainingMetadata => ({
  game: 'petJeopardy',
  correct: jeopardyCorrectCount(game),
  total: jeopardyAnsweredCount(game),
  durationSeconds: Math.max(1, Math.round(durationSeconds)),
  score: jeopardyScore(game),
  points: game.boardPoints,
  maxPoints: jeopardyMaxBoardPoints(),
  xpAwarded: jeopardyNetXp(game),
});
