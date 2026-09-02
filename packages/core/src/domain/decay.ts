import { determineMood } from './petHealthEngine';
import { clamp, type PetState } from './pet';

export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How much wall-clock time one "day" of decline represents. THE ONE TUNABLE.
 * Testing compresses the clock, never the rates -- so a test run exercises the
 * real curve, just faster. The whole ladder is observable in ~11 minutes.
 *
 * SHIPPING THIS AS ONE_MINUTE_MS PUTS EVERY PET IN THE DEATH ANIMATION
 * OVERNIGHT. IS_TEST_DECAY_PERIOD drives a loud in-app banner so a wrong
 * value cannot survive a build review.
 */
export const DECAY_PERIOD_MS = ONE_MINUTE_MS; // <- flip to ONE_DAY_MS to ship

export const IS_TEST_DECAY_PERIOD = DECAY_PERIOD_MS !== ONE_DAY_MS;

/** UI refresh cadence. Follows the period: 5s in test, 60s in production. */
export const DECAY_TICK_MS = Math.min(60_000, Math.max(5_000, DECAY_PERIOD_MS / 12));

/**
 * Decline per "day", identical in test and production -- only the length of a
 * day changes. Health is deliberately absent: it is a consequence of the other
 * needs, not a stat that ticks down on its own.
 */
export const DECAY_PER_DAY = {
  nutrition: 18,
  energy: 12,
  happiness: 10,
  mind: 5,
} as const;

/**
 * Any single settle caps the elapsed window. A user back from three weeks away
 * is treated as away 14 days -- and this also absorbs device clock skew that
 * jumps forward (the `Math.max(0, ...)` below absorbs it jumping backward).
 */
export const MAX_DECAY_DAYS = 14;

/** Derived health never reaches 0: a Health bar of 1 is an honest "alive" signal. */
export const MIN_LIVING_HEALTH = 1;

/** Below this a need is starving/exhausted/miserable and starts costing health. */
const CRITICAL_NEED = 20;
/** At or above this on every need, the pet is thriving and health regenerates. */
const THRIVING_NEED = 60;

const HEALTH_REGEN_PER_DAY = 3;
const HEALTH_DRAIN_PER_CRITICAL_NEED_PER_DAY = 4;

/** The needs that can kill. `mind` is excluded: a dull mind drives a visual, it does not kill the dog. */
const VITAL_NEEDS = ['nutrition', 'energy', 'happiness'] as const;

/**
 * Projects a pet's needs-based stats forward from its last care event to `asOf`,
 * deriving health from how long those needs spent bottomed out or comfortable.
 *
 * ALWAYS DERIVE FROM THE STORED PET; NEVER FEED THE RESULT BACK IN AS INPUT.
 * The returned pet carries the same `lastEventAt` it came in with, so decaying
 * an already-decayed pet applies the same elapsed window a second time and the
 * loss compounds. This is a display projection: render it, don't store it.
 * Persistence happens only at care time, where `recordEvent` decays from the
 * stored pet, applies the delta, and sets `lastEventAt` to the event time --
 * that new anchor is what makes the next projection start from zero.
 */
export const applyTimeDecay = (pet: PetState, asOf: Date): PetState => {
  const anchor = new Date(pet.lastEventAt ?? pet.adoptedAt);
  const elapsedDays = Math.min(
    MAX_DECAY_DAYS,
    Math.max(0, (asOf.getTime() - anchor.getTime()) / DECAY_PERIOD_MS),
  );
  if (elapsedDays <= 0) return pet;

  const energy = clamp(pet.energy - elapsedDays * DECAY_PER_DAY.energy);
  const nutrition = clamp(pet.nutrition - elapsedDays * DECAY_PER_DAY.nutrition);
  const happiness = clamp(pet.happiness - elapsedDays * DECAY_PER_DAY.happiness);
  const mind = clamp(pet.mind - elapsedDays * DECAY_PER_DAY.mind);

  // Each need falls linearly, so the moment it crosses a threshold is analytic:
  // no simulation loop, and the answer is identical at any tick granularity.
  const daysUntil = (stat: (typeof VITAL_NEEDS)[number], floor: number) =>
    Math.max(0, (pet[stat] - floor) / DECAY_PER_DAY[stat]);

  const criticalDays = VITAL_NEEDS.reduce(
    (total, stat) => total + Math.max(0, elapsedDays - daysUntil(stat, CRITICAL_NEED)),
    0,
  );
  const thrivingDays = Math.min(
    elapsedDays,
    Math.min(...VITAL_NEEDS.map((stat) => daysUntil(stat, THRIVING_NEED))),
  );

  const healthDelta =
    HEALTH_REGEN_PER_DAY * thrivingDays -
    HEALTH_DRAIN_PER_CRITICAL_NEED_PER_DAY * criticalDays;
  const health = clamp(pet.health + healthDelta, MIN_LIVING_HEALTH, 100);

  return {
    ...pet,
    health,
    energy,
    nutrition,
    happiness,
    mind,
    mood: determineMood(energy, nutrition, happiness),
  };
};
