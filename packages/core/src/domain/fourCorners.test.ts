import { describe, expect, it } from 'vitest';
import {
  FOUR_CORNERS,
  FOUR_CORNERS_POINTS_ATTEMPT,
  FOUR_CORNERS_POINTS_CORRECT,
  FOUR_CORNERS_QUESTIONS_PER_ROUND,
  type FourCornersRound,
  type TriviaQuestion,
  advanceFourCornersRound,
  answerFourCornersCard,
  createFourCornersRound,
  currentFourCornersCard,
  fourCornersCorrectCount,
  fourCornersMaxPoints,
  fourCornersPoints,
  fourCornersScore,
  toFourCornersMetadata,
} from './fourCorners';
import { triviaQuestions } from '../data/triviaQuestions';

const question = (id: string): TriviaQuestion => ({
  id,
  category: 'general',
  prompt: `Prompt ${id}?`,
  answers: [`${id}-right`, `${id}-a`, `${id}-b`, `${id}-c`],
});

const pool = (size: number): TriviaQuestion[] =>
  Array.from({ length: size }, (_, index) => question(`q${index}`));

/** Deterministic linear-congruential rng, so shuffles are reproducible in tests. */
const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

/** Answers the current card either right or wrong, then advances. */
const play = (round: FourCornersRound, correct: boolean): FourCornersRound => {
  const card = currentFourCornersCard(round);
  if (!card) throw new Error('No card to play');
  const chosen = correct
    ? card.correctCorner
    : FOUR_CORNERS.find((corner) => corner !== card.correctCorner)!;
  return advanceFourCornersRound(answerFourCornersCard(round, chosen));
};

const playAll = (round: FourCornersRound, results: boolean[]): FourCornersRound =>
  results.reduce((current, correct) => play(current, correct), round);

describe('createFourCornersRound', () => {
  it('deals five questions when the pool has headroom', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));

    expect(round.cards).toHaveLength(FOUR_CORNERS_QUESTIONS_PER_ROUND);
    expect(round.index).toBe(0);
    expect(round.status).toBe('asking');
    expect(round.answers).toHaveLength(0);
  });

  it('never repeats a question within a round', () => {
    const round = createFourCornersRound(pool(20), seededRng(7));

    const ids = round.cards.map((card) => card.question.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('deals every question when the pool is smaller than a full round', () => {
    const round = createFourCornersRound(pool(3), seededRng(3));

    expect(round.cards).toHaveLength(3);
    expect(new Set(round.cards.map((card) => card.question.id)).size).toBe(3);
  });

  it('throws a readable error when the question pool is empty', () => {
    expect(() => createFourCornersRound([], seededRng(1))).toThrow(/no trivia questions/i);
  });

  it('places the four answers across the four corners, correct one included', () => {
    const round = createFourCornersRound(pool(20), seededRng(11));

    for (const card of round.cards) {
      const placed = FOUR_CORNERS.map((corner) => card.options[corner]);
      expect(new Set(placed)).toEqual(new Set(card.question.answers));
      expect(card.options[card.correctCorner]).toBe(card.question.answers[0]);
    }
  });

  it('varies which corner holds the correct answer across a round', () => {
    const round = createFourCornersRound(pool(20), seededRng(5));

    const corners = new Set(round.cards.map((card) => card.correctCorner));

    expect(corners.size).toBeGreaterThan(1);
  });

  it('does not mutate the question pool it is given', () => {
    const questions = pool(8);
    const snapshot = questions.map((entry) => entry.id);

    createFourCornersRound(questions, seededRng(2));

    expect(questions.map((entry) => entry.id)).toEqual(snapshot);
  });
});

describe('answerFourCornersCard', () => {
  it('records a correct answer and moves to revealing', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));
    const card = currentFourCornersCard(round)!;

    const answered = answerFourCornersCard(round, card.correctCorner);

    expect(answered.status).toBe('revealing');
    expect(answered.answers).toHaveLength(1);
    expect(answered.answers[0]).toMatchObject({
      questionId: card.question.id,
      chosen: card.correctCorner,
      correctCorner: card.correctCorner,
      correct: true,
      points: FOUR_CORNERS_POINTS_CORRECT,
    });
  });

  it('records a wrong answer with the participation award and the real answer', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));
    const card = currentFourCornersCard(round)!;
    const wrong = FOUR_CORNERS.find((corner) => corner !== card.correctCorner)!;

    const answered = answerFourCornersCard(round, wrong);

    expect(answered.answers[0]).toMatchObject({
      chosen: wrong,
      correctCorner: card.correctCorner,
      correct: false,
      points: FOUR_CORNERS_POINTS_ATTEMPT,
    });
    expect(FOUR_CORNERS_POINTS_ATTEMPT).toBeLessThan(FOUR_CORNERS_POINTS_CORRECT);
  });

  it('ignores a second tap on the same question', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));
    const card = currentFourCornersCard(round)!;
    const wrong = FOUR_CORNERS.find((corner) => corner !== card.correctCorner)!;

    const once = answerFourCornersCard(round, card.correctCorner);
    const twice = answerFourCornersCard(once, wrong);

    expect(twice).toBe(once);
    expect(twice.answers).toHaveLength(1);
    expect(fourCornersPoints(twice)).toBe(FOUR_CORNERS_POINTS_CORRECT);
  });

  it('leaves the round it was given untouched', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));

    answerFourCornersCard(round, 'topLeft');

    expect(round.answers).toHaveLength(0);
    expect(round.status).toBe('asking');
  });

  it('refuses an answer once the round is complete', () => {
    const round = playAll(createFourCornersRound(pool(20), seededRng(1)), [true, true, true, true, true]);

    expect(round.status).toBe('complete');
    expect(answerFourCornersCard(round, 'topLeft')).toBe(round);
  });
});

describe('advanceFourCornersRound', () => {
  it('moves to the next question after a reveal', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));
    const first = currentFourCornersCard(round)!;

    const next = advanceFourCornersRound(answerFourCornersCard(round, first.correctCorner));

    expect(next.status).toBe('asking');
    expect(next.index).toBe(1);
    expect(currentFourCornersCard(next)!.question.id).not.toBe(first.question.id);
  });

  it('completes after exactly five questions', () => {
    let round = createFourCornersRound(pool(20), seededRng(1));

    for (let played = 1; played <= FOUR_CORNERS_QUESTIONS_PER_ROUND; played += 1) {
      round = play(round, true);
      const finished = played === FOUR_CORNERS_QUESTIONS_PER_ROUND;
      expect(round.status).toBe(finished ? 'complete' : 'asking');
    }

    expect(round.answers).toHaveLength(FOUR_CORNERS_QUESTIONS_PER_ROUND);
    expect(currentFourCornersCard(round)).toBeNull();
  });

  it('ignores an advance while a question is still unanswered', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));

    expect(advanceFourCornersRound(round)).toBe(round);
  });

  it('ignores a repeated advance after a reveal', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));
    const card = currentFourCornersCard(round)!;
    const advanced = advanceFourCornersRound(answerFourCornersCard(round, card.correctCorner));

    expect(advanceFourCornersRound(advanced)).toBe(advanced);
  });
});

describe('four corners scoring', () => {
  it('counts correct answers and points across a mixed round', () => {
    const round = playAll(createFourCornersRound(pool(20), seededRng(1)), [
      true,
      false,
      true,
      true,
      false,
    ]);

    expect(fourCornersCorrectCount(round)).toBe(3);
    expect(fourCornersPoints(round)).toBe(3 * FOUR_CORNERS_POINTS_CORRECT + 2 * FOUR_CORNERS_POINTS_ATTEMPT);
    expect(fourCornersMaxPoints(round)).toBe(FOUR_CORNERS_QUESTIONS_PER_ROUND * FOUR_CORNERS_POINTS_CORRECT);
  });

  it('scores a perfect round 100 and a blank round 0', () => {
    const perfect = playAll(createFourCornersRound(pool(20), seededRng(1)), [true, true, true, true, true]);
    const blank = playAll(createFourCornersRound(pool(20), seededRng(1)), [false, false, false, false, false]);

    expect(fourCornersScore(perfect)).toBe(100);
    expect(fourCornersScore(blank)).toBe(0);
  });

  it('scores an unfinished round on the questions actually answered', () => {
    const round = playAll(createFourCornersRound(pool(20), seededRng(1)), [true, false]);

    expect(fourCornersScore(round)).toBe(50);
  });

  it('scores a round with no answers at all as zero rather than NaN', () => {
    const round = createFourCornersRound(pool(20), seededRng(1));

    expect(fourCornersScore(round)).toBe(0);
    expect(fourCornersPoints(round)).toBe(0);
  });
});

describe('toFourCornersMetadata', () => {
  it('reports the round as a brain-training session', () => {
    const round = playAll(createFourCornersRound(pool(20), seededRng(1)), [true, true, true, true, false]);

    const metadata = toFourCornersMetadata(round, 42);

    expect(metadata).toMatchObject({
      game: 'fourCorners',
      correct: 4,
      total: FOUR_CORNERS_QUESTIONS_PER_ROUND,
      durationSeconds: 42,
      score: 80,
      points: 4 * FOUR_CORNERS_POINTS_CORRECT + FOUR_CORNERS_POINTS_ATTEMPT,
      maxPoints: FOUR_CORNERS_QUESTIONS_PER_ROUND * FOUR_CORNERS_POINTS_CORRECT,
    });
  });

  it('totals only the questions answered when the round was left early', () => {
    const round = playAll(createFourCornersRound(pool(20), seededRng(1)), [true, false]);

    const metadata = toFourCornersMetadata(round, 9);

    expect(metadata.correct).toBe(1);
    expect(metadata.total).toBe(2);
  });

  it('floors the duration at one second so a fast round is never zero', () => {
    const round = playAll(createFourCornersRound(pool(20), seededRng(1)), [true, true, true, true, true]);

    expect(toFourCornersMetadata(round, 0).durationSeconds).toBe(1);
  });
});

describe('the shipped trivia pool', () => {
  it('has enough questions for a round without repeats', () => {
    expect(triviaQuestions.length).toBeGreaterThanOrEqual(FOUR_CORNERS_QUESTIONS_PER_ROUND * 3);
  });

  it('gives every question a unique id', () => {
    const ids = triviaQuestions.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every question exactly four distinct, non-empty answers', () => {
    for (const entry of triviaQuestions) {
      expect(entry.answers).toHaveLength(FOUR_CORNERS.length);
      expect(new Set(entry.answers).size).toBe(FOUR_CORNERS.length);
      expect(entry.answers.every((answer) => answer.trim().length > 0)).toBe(true);
      expect(entry.prompt.trim().length).toBeGreaterThan(0);
    }
  });
});
