import { MATH_ROUND_SECONDS, type MathProblem, generateMathProblem, mindScore, tierForStreak } from './brainGames';
import type { BrainTrainingMetadata } from './health';

/**
 * Quick maths as a runner: the pet runs along a track and an obstacle rolls in
 * from the right carrying a sum. Answer it before the obstacle arrives and the
 * pet jumps clear; a wrong answer or no answer at all is a hit. Three hits end
 * the run early, and the clock ends it otherwise.
 *
 * Everything here is pure and rng-injectable. The screen owns the clock and the
 * animation; this owns the run. `answerMathRun`, `collideMathRun`,
 * `advanceMathRun` and `endMathRun` are the ONLY transitions, and each returns
 * the same reference unless it is its turn, so a rapid double-submit is a no-op
 * rather than a double count (the same contract `fourCorners.ts` set).
 *
 * The event it records is still `game: 'math'`: the pet engine, the care log and
 * the profile history all keep reading it as Quick maths, and `mindScore` keeps
 * scoring it on accuracy and pace exactly as before — "dodged" is "correct" and
 * "faced" is "total".
 */

export const MATH_RUN_SECONDS = MATH_ROUND_SECONDS;
/** Hits the run survives. The third ends it. */
export const MATH_RUN_LIVES = 3;

export const MATH_RUN_OBSTACLES = ['log', 'rock', 'puddle', 'fence', 'bush'] as const;
export type MathRunObstacleKind = (typeof MATH_RUN_OBSTACLES)[number];

/**
 * How long an obstacle takes to reach the pet, by problem tier, before the pace
 * penalty. Harder sums get longer windows: tier five is two-digit
 * multiplication, and six seconds for that is a wall, not a game.
 */
const TIER_WINDOW_MS = [6000, 7000, 8000, 9000, 10000] as const;
/** Each dodge in a row quickens the run by this share of the tier's window... */
const PACE_STEP = 0.03;
/** ...down to this floor, so a long streak is fast but never impossible. */
const MIN_PACE = 0.6;

/**
 * Milliseconds the player has to answer before the obstacle reaches the pet.
 * Climbs with the tier (harder sum, more time) and shrinks with the streak (the
 * run speeds up), so a strong run feels faster without the sums becoming unfair.
 */
export const obstacleWindowMs = (streak: number): number => {
  const safeStreak = Math.max(0, Math.floor(streak));
  const base = TIER_WINDOW_MS[tierForStreak(safeStreak) - 1];
  const pace = Math.max(MIN_PACE, 1 - safeStreak * PACE_STEP);
  return Math.round(base * pace);
};

export interface MathRunObstacle {
  kind: MathRunObstacleKind;
  problem: MathProblem;
  /** See {@link obstacleWindowMs}. Fixed when the obstacle spawns. */
  windowMs: number;
}

/**
 * `running` — the obstacle is approaching, waiting on an answer. `dodging` — the
 * pet is mid-jump over it, further answers ignored. `hit` — it got the pet,
 * feedback on screen. `over` — no lives or no time left.
 */
export type MathRunStatus = 'running' | 'dodging' | 'hit' | 'over';

export interface MathRunOutcome {
  problem: MathProblem;
  /** What the player typed, or `null` when the obstacle arrived unanswered. */
  entered: number | null;
  dodged: boolean;
}

export interface MathRunState {
  obstacle: MathRunObstacle;
  status: MathRunStatus;
  streak: number;
  bestStreak: number;
  /** Obstacles cleared — the session's `correct`. */
  dodged: number;
  /** Obstacles that got the pet. */
  hits: number;
  /** Obstacles resolved either way — the session's `total`. */
  faced: number;
  /** The most recent resolution, for the screen's feedback line. */
  lastOutcome: MathRunOutcome | null;
}

type Rng = () => number;

const pickKind = (rng: Rng): MathRunObstacleKind =>
  MATH_RUN_OBSTACLES[Math.min(MATH_RUN_OBSTACLES.length - 1, Math.floor(rng() * MATH_RUN_OBSTACLES.length))];

const spawnObstacle = (streak: number, rng: Rng): MathRunObstacle => ({
  kind: pickKind(rng),
  problem: generateMathProblem(streak, rng),
  windowMs: obstacleWindowMs(streak),
});

export const createMathRun = (rng: Rng = Math.random): MathRunState => ({
  obstacle: spawnObstacle(0, rng),
  status: 'running',
  streak: 0,
  bestStreak: 0,
  dodged: 0,
  hits: 0,
  faced: 0,
  lastOutcome: null,
});

export const mathRunLivesLeft = (state: MathRunState): number => Math.max(0, MATH_RUN_LIVES - state.hits);

const resolve = (state: MathRunState, entered: number | null): MathRunState => {
  if (state.status !== 'running') return state;
  const dodged = entered !== null && entered === state.obstacle.problem.answer;
  const hits = state.hits + (dodged ? 0 : 1);
  const streak = dodged ? state.streak + 1 : 0;
  return {
    ...state,
    status: dodged ? 'dodging' : hits >= MATH_RUN_LIVES ? 'over' : 'hit',
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    dodged: state.dodged + (dodged ? 1 : 0),
    hits,
    faced: state.faced + 1,
    lastOutcome: { problem: state.obstacle.problem, entered, dodged },
  };
};

/** The player answered. A wrong answer is a hit, the same as no answer. */
export const answerMathRun = (state: MathRunState, entered: number): MathRunState =>
  resolve(state, Number.isFinite(entered) ? entered : null);

/** The obstacle reached the pet with no answer given. */
export const collideMathRun = (state: MathRunState): MathRunState => resolve(state, null);

/** After a dodge or a hit has been shown, the next obstacle rolls in. */
export const advanceMathRun = (state: MathRunState, rng: Rng = Math.random): MathRunState => {
  if (state.status !== 'dodging' && state.status !== 'hit') return state;
  return { ...state, status: 'running', obstacle: spawnObstacle(state.streak, rng) };
};

/** The clock ran out. Idempotent, and it does not count the obstacle still approaching. */
export const endMathRun = (state: MathRunState): MathRunState =>
  state.status === 'over' ? state : { ...state, status: 'over' };

export const toMathRunMetadata = (state: MathRunState, durationSeconds: number): BrainTrainingMetadata => {
  const duration = Math.max(1, Math.round(durationSeconds));
  const scored = { correct: state.dodged, total: state.faced };
  return {
    game: 'math',
    ...scored,
    durationSeconds: duration,
    score: mindScore({ game: 'math', ...scored, durationSeconds: duration }),
    bestStreak: state.bestStreak,
  };
};
