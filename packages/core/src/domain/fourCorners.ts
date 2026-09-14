import type { BrainTrainingMetadata } from './health';

/**
 * Four Corners: five quick trivia questions, four answers pinned to the four
 * corners of the play area with the pet in the middle. Everything here is pure
 * and rng-injectable — the screen owns the animation and the clock, this owns
 * the round.
 */

/**
 * Question categories. Only `general` ships today; the field exists so a
 * geography/science/sport pack is a new value plus new rows in
 * `data/triviaQuestions.ts`, not a reshape of the round engine. Filtering a
 * pool by category is the caller's job (`triviaQuestions.filter(...)`), which is
 * why there is no category argument here yet.
 */
export type TriviaCategory = 'general';

export const FOUR_CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
export type FourCorner = (typeof FOUR_CORNERS)[number];

export interface TriviaQuestion {
  id: string;
  category: TriviaCategory;
  prompt: string;
  /**
   * Exactly four answers, **correct one first**. Authoring order, not display
   * order: `createFourCornersRound` shuffles them onto the corners, so the data
   * file never has to think about layout and a reader can see the answer at a
   * glance.
   */
  answers: readonly string[];
}

export const FOUR_CORNERS_QUESTIONS_PER_ROUND = 5;

/**
 * Mind Points, the round's own currency. A wrong answer still pays something —
 * the same principle the pet engine already applies to screen time and sleep,
 * where showing up is rewarded and a bad result is never punished — but always
 * strictly less than getting it right. XP is *not* computed here: that stays
 * with `PetHealthEngine`/`brainTrainingXp`, so this game cannot drift from every
 * other mind session.
 */
export const FOUR_CORNERS_POINTS_CORRECT = 2;
export const FOUR_CORNERS_POINTS_ATTEMPT = 1;

export interface FourCornersCard {
  question: TriviaQuestion;
  /** The question's answers, one per corner, shuffled for this round. */
  options: Readonly<Record<FourCorner, string>>;
  correctCorner: FourCorner;
}

export interface FourCornersAnswer {
  questionId: string;
  chosen: FourCorner;
  correctCorner: FourCorner;
  correct: boolean;
  points: number;
}

/**
 * `asking` — waiting on a tap. `revealing` — answered, feedback on screen, further
 * taps ignored. `complete` — no cards left. The status is what makes rapid
 * multi-tapping a no-op rather than a double award: the transitions below refuse
 * anything that is not their own status.
 */
export type FourCornersStatus = 'asking' | 'revealing' | 'complete';

export interface FourCornersRound {
  cards: readonly FourCornersCard[];
  index: number;
  answers: readonly FourCornersAnswer[];
  status: FourCornersStatus;
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

const toCard = (question: TriviaQuestion, rng: Rng): FourCornersCard => {
  const placed = shuffle(question.answers, rng);
  const options = Object.fromEntries(
    FOUR_CORNERS.map((corner, index) => [corner, placed[index]]),
  ) as Record<FourCorner, string>;
  const correctAnswer = question.answers[0];
  return {
    question,
    options,
    correctCorner: FOUR_CORNERS[placed.indexOf(correctAnswer)],
  };
};

/**
 * Deals a round: up to {@link FOUR_CORNERS_QUESTIONS_PER_ROUND} questions drawn
 * without repeats, each with its answers shuffled across the corners.
 *
 * Throws on an empty pool rather than returning a hollow round, so a missing
 * data file surfaces as one clear message at the top of the screen instead of a
 * game that silently has nothing to ask.
 */
export const createFourCornersRound = (
  pool: readonly TriviaQuestion[],
  rng: Rng = Math.random,
): FourCornersRound => {
  if (pool.length === 0) throw new Error('No trivia questions are available right now.');
  const cards = shuffle(pool, rng)
    .slice(0, FOUR_CORNERS_QUESTIONS_PER_ROUND)
    .map((question) => toCard(question, rng));
  return { cards, index: 0, answers: [], status: 'asking' };
};

export const currentFourCornersCard = (round: FourCornersRound): FourCornersCard | null =>
  round.cards[round.index] ?? null;

/**
 * Locks in the tapped corner. Returns the round **unchanged and identical by
 * reference** unless it is waiting on an answer, which is the whole
 * double-submit guard: a second tap during the reveal cannot add a second answer
 * or a second award.
 */
export const answerFourCornersCard = (round: FourCornersRound, chosen: FourCorner): FourCornersRound => {
  if (round.status !== 'asking') return round;
  const card = currentFourCornersCard(round);
  if (!card) return round;

  const correct = chosen === card.correctCorner;
  const answer: FourCornersAnswer = {
    questionId: card.question.id,
    chosen,
    correctCorner: card.correctCorner,
    correct,
    points: correct ? FOUR_CORNERS_POINTS_CORRECT : FOUR_CORNERS_POINTS_ATTEMPT,
  };
  return { ...round, answers: [...round.answers, answer], status: 'revealing' };
};

/** Moves past the reveal. A no-op in any other status, so a stray timer cannot skip a question. */
export const advanceFourCornersRound = (round: FourCornersRound): FourCornersRound => {
  if (round.status !== 'revealing') return round;
  const next = round.index + 1;
  return next >= round.cards.length
    ? { ...round, index: next, status: 'complete' }
    : { ...round, index: next, status: 'asking' };
};

export const fourCornersCorrectCount = (round: FourCornersRound): number =>
  round.answers.filter((answer) => answer.correct).length;

export const fourCornersPoints = (round: FourCornersRound): number =>
  round.answers.reduce((total, answer) => total + answer.points, 0);

export const fourCornersMaxPoints = (round: FourCornersRound): number =>
  round.cards.length * FOUR_CORNERS_POINTS_CORRECT;

/**
 * 0-100 accuracy over the questions actually answered. Deliberately not
 * {@link mindScore}: that scores pace, and a five-question round is too short
 * for answers-per-minute to say anything true.
 */
export const fourCornersScore = (round: FourCornersRound): number => {
  if (round.answers.length === 0) return 0;
  return Math.round((fourCornersCorrectCount(round) / round.answers.length) * 100);
};

/**
 * The round as a `BRAIN_TRAINING` event's metadata — the same shape every other
 * mind game records, so the pet engine, care diary and mind streaks pick it up
 * with no special cases.
 *
 * `total` is the questions answered rather than the questions dealt, so a round
 * left early reads as "1 of 2" and is scored on what the user actually did.
 */
export const toFourCornersMetadata = (
  round: FourCornersRound,
  durationSeconds: number,
): BrainTrainingMetadata => ({
  game: 'fourCorners',
  correct: fourCornersCorrectCount(round),
  total: round.answers.length,
  durationSeconds: Math.max(1, Math.round(durationSeconds)),
  score: fourCornersScore(round),
  points: fourCornersPoints(round),
  maxPoints: fourCornersMaxPoints(round),
});
