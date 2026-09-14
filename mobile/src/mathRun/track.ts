import type { MathRunObstacleKind } from '@vitto/core';

/**
 * Geometry and timing for the Quick maths run, kept out of the component so the
 * layout numbers, the animation durations and the accessibility labels all have
 * one home — and so the test can build the same label the obstacle renders.
 */

export const OBSTACLE_NAME: Record<MathRunObstacleKind, string> = {
  log: 'Log',
  rock: 'Rock',
  puddle: 'Puddle',
  fence: 'Fence',
  bush: 'Bush',
};

/** The obstacle's accessibility label — its name and how long until it arrives. */
export const obstacleLabel = (kind: MathRunObstacleKind, secondsLeft: number): string =>
  `${OBSTACLE_NAME[kind]} ahead, ${secondsLeft} ${secondsLeft === 1 ? 'second' : 'seconds'}`;

/** The track: a sky band over a ground strip, the pet running in place at the left. */
export const TRACK_HEIGHT = 190;
export const GROUND_HEIGHT = 38;
export const PET_SIZE = 92;
export const PET_LEFT = 14;
export const OBSTACLE_SIZE = 44;
/** Used until the track has reported its real width. */
export const FALLBACK_TRACK_WIDTH = 340;

/**
 * Where the obstacle's left edge stops when it gets the pet: against the
 * sprite's front, so it reads as a collision and not as the obstacle passing
 * through. Its centre is still to the right of the pet's, so even an answer on
 * the last tick leaves the obstacle somewhere to travel for the jump-over.
 */
export const collisionX = (): number => PET_LEFT + PET_SIZE * 0.55;

/** Off the left edge, where a dodged obstacle disappears to. */
export const clearedX = (): number => -OBSTACLE_SIZE - 12;

/** The point the pet is over: the obstacle's centre passing this is the moment of the jump. */
export const petCentreX = (): number => PET_LEFT + PET_SIZE / 2;

/**
 * Where an approaching obstacle's left edge is, given how far through its
 * window it has got — the same straight line the approach animation draws, so
 * the dash can pick up exactly where it left off. Computed from time rather than
 * read back from the animated value: values driven natively do not report their
 * position to JS mid-flight.
 */
export const approachX = (progress: number, trackWidth: number): number => {
  const clamped = Math.max(0, Math.min(1, progress));
  return trackWidth + clamped * (collisionX() - trackWidth);
};

/**
 * The loop's tempo. Every one of these is short on purpose: the run is a minute
 * long and the next obstacle should be rolling in before the last one is a memory.
 */
/** The pet's jump over a dodged obstacle. Its apex is at the halfway point. */
export const HOP_MS = 360;
/** How fast a dodged obstacle rushes under the pet, in points per millisecond. */
export const DASH_SPEED = 0.9;
/** Time for the pet to land and the dust to settle after the obstacle has passed. */
export const HOP_SETTLE_MS = 160;

export interface DodgePlan {
  /** Wait this long after the answer before the pet leaves the ground. */
  hopDelayMs: number;
  /** How long the obstacle takes to rush from where it is to off the left edge. */
  dashMs: number;
  /** How long the whole dodge is on screen before the next obstacle spawns. */
  holdMs: number;
}

/**
 * Times the jump to the obstacle. The obstacle dashes from where it is to off
 * the left edge at a constant speed, and the hop is started so its apex lands
 * on the instant the obstacle's centre passes the pet's. An obstacle already
 * nearly on the pet would pass before the pet was off the ground, so the dash
 * slows for that one until the pet has half a hop to get up there.
 */
export const dodgePlan = (currentX: number): DodgePlan => {
  const obstacleCentre = currentX + OBSTACLE_SIZE / 2;
  const toPet = Math.max(1, obstacleCentre - petCentreX());
  const speed = Math.min(DASH_SPEED, toPet / (HOP_MS / 2));
  const hopDelayMs = Math.max(0, Math.round(toPet / speed - HOP_MS / 2));
  const dashMs = Math.round((currentX - clearedX()) / speed);
  return {
    hopDelayMs,
    dashMs,
    holdMs: Math.max(RESOLVE_HOLD_MS, Math.max(dashMs, hopDelayMs + HOP_MS) + HOP_SETTLE_MS),
  };
};
/** A stumble on impact. */
export const SHAKE_MS = 320;
/** How long a dodge or a hit stays on screen before the next obstacle spawns. */
export const RESOLVE_HOLD_MS = 700;
/** The final hit stays up a little longer before the results card takes over. */
export const OVER_HOLD_MS = 1000;
/** One pass of the ground's markers. */
export const GROUND_LOOP_MS = 900;
/** Spacing of the ground's markers; the loop slides exactly one of these. */
export const GROUND_TILE = 56;
/** The clock and the collision check share one tick. */
export const TICK_MS = 100;
