import { determineMood } from './petHealthEngine';
import { hungerAt, hungerSteps, mealsOf } from './hunger';
import { applyCareAreas, untrackedNeeds, type CareArea } from './careAreas';
import { chargeOf, clamp, lockEvolution, type PetState } from './pet';
import { DECAY_PERIOD_MS } from './decayClock';

export * from './decayClock';


/**
 * Decline per "day", identical in test and production -- only the length of a
 * day changes. Health is deliberately absent: it is a consequence of the other
 * needs, not a stat that ticks down on its own.
 */
export const DECAY_PER_DAY = {
  energy: 12,
  /**
   * Energy (sleep and food). A night's sleep or two meals cover a day of it,
   * so without Apple Health, eating alone keeps a pet awake.
   */
  charge: 16,
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
  const charge = clamp(chargeOf(pet) - elapsedDays * rate('charge'));
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
    charge,
    nutrition,
    happiness,
    mind,
    mood: determineMood({ energy, charge, nutrition, happiness }),
  };
};
