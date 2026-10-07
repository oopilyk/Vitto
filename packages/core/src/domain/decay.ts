import { determineMood } from './petHealthEngine';
import { hungerAt, hungerSteps, mealsOf } from './hunger';
import { applyCareAreas, untrackedNeeds, type CareArea } from './careAreas';
import { clamp, lockEvolution, type PetState } from './pet';

export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The env var that opts a build into the compressed QA clock. Any other value
 * (including unset) runs the real one-day-per-day cadence. `EXPO_PUBLIC_` so
 * Expo inlines it into the mobile bundle at build time, matching the rest of the
 * app's env conventions.
 */
export const DECAY_FAST_ENV_KEY = 'EXPO_PUBLIC_DECAY_FAST';

/** The values that turn the fast clock on. Everything else leaves it off. */
const DECAY_FAST_ENABLED_VALUES: ReadonlySet<string> = new Set(['1', 'true']);

/** `process` is absent in some RN/web runtimes; never throw while reading it. */
const readProcessEnv = (): Readonly<Record<string, string | undefined>> =>
  typeof process !== 'undefined' && process.env ? process.env : {};

/**
 * Whether the given environment asks for the compressed decay clock. Pure and
 * env-injected so a test can exercise both modes without reloading the module.
 */
export const isDecayFastMode = (
  env: Readonly<Record<string, string | undefined>> = readProcessEnv(),
): boolean => DECAY_FAST_ENABLED_VALUES.has(env[DECAY_FAST_ENV_KEY] ?? '');

/**
 * Maps the fast-mode flag to the length of one decline "day".
 * Exported so the cadence choice is unit-testable on its own.
 */
export const resolveDecayPeriodMs = (fastMode: boolean): number =>
  fastMode ? ONE_MINUTE_MS : ONE_DAY_MS;

/**
 * How much wall-clock time one "day" of decline represents. THE ONE TUNABLE.
 * Testing compresses the clock, never the rates -- so a test run exercises the
 * real curve, just faster. The whole ladder is observable in ~11 minutes.
 *
 * Production cadence (`ONE_DAY_MS`) is the default. Set EXPO_PUBLIC_DECAY_FAST=1
 * for the ~11-minute QA clock. IS_TEST_DECAY_PERIOD drives a loud in-app banner
 * so a fast build cannot ship unnoticed.
 */
export const DECAY_PERIOD_MS = resolveDecayPeriodMs(isDecayFastMode());

export const IS_TEST_DECAY_PERIOD = DECAY_PERIOD_MS !== ONE_DAY_MS;

/** UI refresh cadence. Follows the period: 5s in test, 60s in production. */
export const DECAY_TICK_MS = Math.min(60_000, Math.max(5_000, DECAY_PERIOD_MS / 12));

/**
 * Decline per "day", identical in test and production -- only the length of a
 * day changes. Health is deliberately absent: it is a consequence of the other
 * needs, not a stat that ticks down on its own.
 */
export const DECAY_PER_DAY = {
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
export const CRITICAL_NEED = 20;
/** At or above this on every need, the pet is thriving and health regenerates. */
export const THRIVING_NEED = 60;

export const HEALTH_REGEN_PER_DAY = 3;
export const HEALTH_DRAIN_PER_CRITICAL_NEED_PER_DAY = 4;

/** The needs that can kill. `mind` is excluded: a dull mind drives a visual, it does not kill the dog. */
export const VITAL_NEEDS = ['nutrition', 'energy', 'happiness'] as const;

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
 *
 * `careAreas` is what the pet's owner chose to look after (see careAreas.ts),
 * and defaults to the pet's own setting. A need none of them feeds is held at
 * a comfortable level and does not decay, so it can neither ail the pet nor
 * cost it health. A pet with no setting decays every need, as it always has.
 */
export const applyTimeDecay = (
  stored: PetState,
  asOf: Date,
  careAreas: readonly CareArea[] | null | undefined = stored.careAreas,
): PetState => {
  // Locked from the stats as they stood before this decay, so a pet saved while
  // evolved can never decay out of its evolution (mind drops 5 a day).
  const pet = applyCareAreas(lockEvolution(stored), careAreas);
  const held = new Set<string>(untrackedNeeds(careAreas));
  const rate = (stat: keyof typeof DECAY_PER_DAY) => (held.has(stat) ? 0 : DECAY_PER_DAY[stat]);
  const anchor = new Date(pet.lastEventAt ?? pet.adoptedAt);
  const elapsedDays = Math.min(
    MAX_DECAY_DAYS,
    Math.max(0, (asOf.getTime() - anchor.getTime()) / DECAY_PERIOD_MS),
  );
  if (elapsedDays <= 0) return pet;

  const energy = clamp(pet.energy - elapsedDays * rate('energy'));
  // Hunger is what was eaten in the last day (see hunger.ts): it steps down
  // as each meal wears off, and the steps are kept for the health reckoning.
  const anchorMs = anchor.getTime();
  const endMs = anchorMs + elapsedDays * DECAY_PERIOD_MS;
  const meals = mealsOf(pet);
  const tracksFood = !held.has('nutrition');
  const nutrition = tracksFood ? hungerAt(meals, endMs) : pet.nutrition;
  const startNutrition = tracksFood ? hungerAt(meals, anchorMs) : pet.nutrition;
  const steps = tracksFood
    ? hungerSteps(meals, anchorMs, endMs).map((step) => ({ day: (step.atMs - anchorMs) / DECAY_PERIOD_MS, value: step.value }))
    : [];
  const happiness = clamp(pet.happiness - elapsedDays * rate('happiness'));
  const mind = clamp(pet.mind - elapsedDays * rate('mind'));

  // Each need falls linearly, so the moment it crosses a threshold is analytic:
  // no simulation loop, and the answer is identical at any tick granularity.
  // A held need never falls, so it never reaches either threshold.
  // Hunger falls in steps, so its moment is the first step under the floor.
  const daysUntil = (stat: (typeof VITAL_NEEDS)[number], floor: number) => {
    if (stat === 'nutrition') {
      if (!tracksFood) return Infinity;
      if (startNutrition < floor) return 0;
      return steps.find((step) => step.value < floor)?.day ?? Infinity;
    }
    return rate(stat) === 0 ? Infinity : Math.max(0, (pet[stat] - floor) / rate(stat));
  };

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
