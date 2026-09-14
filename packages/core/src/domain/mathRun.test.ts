import { describe, expect, it } from 'vitest';
import { MAX_TIER, tierForStreak } from './brainGames';
import {
  MATH_RUN_LIVES,
  MATH_RUN_OBSTACLES,
  type MathRunState,
  advanceMathRun,
  answerMathRun,
  collideMathRun,
  createMathRun,
  endMathRun,
  mathRunLivesLeft,
  obstacleWindowMs,
  toMathRunMetadata,
} from './mathRun';

const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const right = (state: MathRunState) => answerMathRun(state, state.obstacle.problem.answer);
const wrong = (state: MathRunState) => answerMathRun(state, state.obstacle.problem.answer + 1);

describe('obstacleWindowMs', () => {
  it('gives harder tiers more time and never drops below the pace floor', () => {
    expect(obstacleWindowMs(0)).toBe(6000);
    // Tier 2 opens with a longer base window, minus three dodges of pace.
    expect(obstacleWindowMs(3)).toBe(Math.round(7000 * (1 - 3 * 0.03)));
    // Deep into the run the pace has bottomed out at 60% of the top tier.
    expect(tierForStreak(40)).toBe(MAX_TIER);
    expect(obstacleWindowMs(40)).toBe(6000);
    expect(obstacleWindowMs(400)).toBe(6000);
  });

  it('treats a negative or fractional streak as the start of the run', () => {
    expect(obstacleWindowMs(-4)).toBe(6000);
    expect(obstacleWindowMs(0.9)).toBe(6000);
  });
});

describe('math run', () => {
  it('starts running at tier one with a known obstacle shape', () => {
    const run = createMathRun(seededRng(1));
    expect(run.status).toBe('running');
    expect(run.obstacle.problem.tier).toBe(1);
    expect(run.obstacle.windowMs).toBe(6000);
    expect(MATH_RUN_OBSTACLES).toContain(run.obstacle.kind);
    expect(mathRunLivesLeft(run)).toBe(MATH_RUN_LIVES);
  });

  it('dodges on the right answer and climbs the tiers as the streak grows', () => {
    let run = createMathRun(seededRng(2));
    for (let index = 0; index < 3; index += 1) {
      run = right(run);
      expect(run.status).toBe('dodging');
      expect(run.lastOutcome).toEqual({ problem: expect.any(Object), entered: expect.any(Number), dodged: true });
      run = advanceMathRun(run, seededRng(10 + index));
      expect(run.status).toBe('running');
    }
    expect(run.dodged).toBe(3);
    expect(run.faced).toBe(3);
    expect(run.hits).toBe(0);
    expect(run.streak).toBe(3);
    expect(run.bestStreak).toBe(3);
    expect(run.obstacle.problem.tier).toBe(2);
    expect(run.obstacle.windowMs).toBe(obstacleWindowMs(3));
  });

  it('takes a hit on a wrong answer, resets the streak and keeps the best', () => {
    let run = advanceMathRun(right(createMathRun(seededRng(3))), seededRng(4));
    run = wrong(run);
    expect(run.status).toBe('hit');
    expect(run.hits).toBe(1);
    expect(run.streak).toBe(0);
    expect(run.bestStreak).toBe(1);
    expect(run.faced).toBe(2);
    expect(run.lastOutcome?.dodged).toBe(false);
    expect(mathRunLivesLeft(run)).toBe(MATH_RUN_LIVES - 1);
  });

  it('counts an unanswered obstacle as a hit with nothing entered', () => {
    const run = collideMathRun(createMathRun(seededRng(5)));
    expect(run.status).toBe('hit');
    expect(run.hits).toBe(1);
    expect(run.lastOutcome?.entered).toBeNull();
  });

  it('treats a non-numeric entry as a miss rather than a crash', () => {
    const run = answerMathRun(createMathRun(seededRng(6)), Number.NaN);
    expect(run.status).toBe('hit');
    expect(run.lastOutcome?.entered).toBeNull();
  });

  it('ends the run on the last life and refuses further play', () => {
    let run = createMathRun(seededRng(7));
    for (let hit = 1; hit < MATH_RUN_LIVES; hit += 1) {
      run = advanceMathRun(wrong(run), seededRng(20 + hit));
    }
    run = wrong(run);
    expect(run.status).toBe('over');
    expect(run.hits).toBe(MATH_RUN_LIVES);
    expect(mathRunLivesLeft(run)).toBe(0);
    expect(advanceMathRun(run, seededRng(9))).toBe(run);
    expect(right(run)).toBe(run);
    expect(collideMathRun(run)).toBe(run);
    expect(endMathRun(run)).toBe(run);
  });

  it('ignores answers while the pet is mid-jump or being hit', () => {
    const dodging = right(createMathRun(seededRng(8)));
    expect(right(dodging)).toBe(dodging);
    expect(collideMathRun(dodging)).toBe(dodging);
    const hit = wrong(createMathRun(seededRng(8)));
    expect(right(hit)).toBe(hit);
  });

  it('only advances from a resolved obstacle', () => {
    const running = createMathRun(seededRng(11));
    expect(advanceMathRun(running, seededRng(12))).toBe(running);
  });

  it('ends on the clock without counting the obstacle still approaching', () => {
    const run = endMathRun(advanceMathRun(right(createMathRun(seededRng(13))), seededRng(14)));
    expect(run.status).toBe('over');
    expect(run.faced).toBe(1);
    expect(run.dodged).toBe(1);
  });

  it('hands back Quick maths metadata with dodges as correct and faced as total', () => {
    let run = createMathRun(seededRng(15));
    run = advanceMathRun(right(run), seededRng(16));
    run = advanceMathRun(right(run), seededRng(17));
    run = advanceMathRun(wrong(run), seededRng(18));
    run = endMathRun(run);
    const metadata = toMathRunMetadata(run, 42.4);
    expect(metadata).toEqual({
      game: 'math',
      correct: 2,
      total: 3,
      durationSeconds: 42,
      score: expect.any(Number),
      bestStreak: 2,
    });
    expect(metadata.score).toBeGreaterThan(0);
    expect(metadata.score).toBeLessThanOrEqual(100);
  });

  it('scores an empty run as nothing and never reports a zero-second session', () => {
    const metadata = toMathRunMetadata(endMathRun(createMathRun(seededRng(19))), 0);
    expect(metadata.score).toBe(0);
    expect(metadata.durationSeconds).toBe(1);
  });
});
