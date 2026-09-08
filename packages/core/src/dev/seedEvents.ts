import type {
  BrainTrainingMetadata,
  HealthEvent,
  MealMetadata,
  SleepMetadata,
  StepMetadata,
  WorkoutMetadata,
} from '../domain/health';

/**
 * Synthetic history for testing the insights layer.
 *
 * The insight thresholds are deliberately conservative — twelve paired days, five
 * days either side of a split, a ten per cent effect — so a real account stays
 * silent for weeks and there is no way to tell a working insight from a broken
 * one. This generates a history that clears those gates, so the copy, the
 * ordering and the dashboard card can all be seen before real data exists.
 *
 * DEV ONLY. Every event it makes is `source: 'mock'`, which is what
 * `isSeededEvent` keys on, so a seeded account can be swept clean again.
 *
 * Deterministic on purpose: same seed, same history. A generator that varied per
 * run would make "did my change break the insight?" unanswerable.
 */

/** Marks everything this file produces, so seeded data can be found and removed. */
export const SEED_SOURCE = 'mock' as const;

export const isSeededEvent = (event: HealthEvent): boolean => event.source === SEED_SOURCE;

/** Mulberry32 — small, fast, and repeatable across platforms. */
const makeRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface SeedOptions {
  /** How far back to generate. The insight lookback is 90 days. */
  days?: number;
  seed?: number;
  /** Anchor for "today"; the newest day generated is the day before this. */
  now?: Date;
}

const atHour = (day: Date, hour: number, minute = 0): string => {
  const stamp = new Date(day);
  stamp.setHours(hour, minute, 0, 0);
  return stamp.toISOString();
};

const dateKeyOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Builds a history with three relationships planted in it, one per insight:
 *
 *   short sleep  -> a worse mind score the next day
 *   high protein -> more training volume the next day
 *   more steps   -> a better mind score the same day
 *
 * Each is well above the ten per cent floor so the insight fires, but noise is
 * layered on top so the numbers do not look synthetic and the group means are
 * not identical every run.
 */
export const generateSeedEvents = (
  userId: string,
  { days = 90, seed = 20260905, now = new Date() }: SeedOptions = {},
): HealthEvent[] => {
  const random = makeRandom(seed);
  const events: HealthEvent[] = [];
  let counter = 0;
  const id = () => `seed-${seed}-${(counter += 1)}`;

  // Decide each day's shape first, so the next day's outcome can read from it.
  const plan = Array.from({ length: days }, () => ({
    shortSleep: random() < 0.45,
    highProtein: random() < 0.5,
    activeSteps: random() < 0.5,
    noise: random(),
    skip: random() < 0.12, // some days are simply not logged
  }));

  for (let offset = days; offset >= 1; offset -= 1) {
    const index = days - offset;
    const day = new Date(now);
    day.setDate(day.getDate() - offset);
    day.setHours(0, 0, 0, 0);
    const today = plan[index];
    const yesterday = index > 0 ? plan[index - 1] : undefined;
    if (today.skip) continue;

    // Sleep, stamped to the morning it ended — the shape SleepMetadata expects.
    const asleepMinutes = today.shortSleep
      ? 270 + Math.round(today.noise * 70) // 4h30-5h40
      : 420 + Math.round(today.noise * 90); // 7h-8h30
    events.push({
      id: id(),
      userId,
      occurredAt: atHour(day, 7),
      type: 'SLEEP',
      source: SEED_SOURCE,
      metadata: { asleepMinutes, night: dateKeyOf(day) } satisfies SleepMetadata,
    });

    const steps = today.activeSteps
      ? 9000 + Math.round(today.noise * 4000)
      : 3200 + Math.round(today.noise * 3500);
    events.push({
      id: id(),
      userId,
      occurredAt: atHour(day, 20),
      type: 'STEP_ACTIVITY',
      source: SEED_SOURCE,
      metadata: { steps, date: dateKeyOf(day) } satisfies StepMetadata,
    });

    // Mind score: hurt by last night's short sleep, helped by today's steps.
    // Twenty questions rather than a dozen: `correct` is a whole number, so with
    // twelve each answer moves the score 8.3% and a planted effect near the 10%
    // floor gets rounded away before the insight ever sees it.
    const total = 20;
    // Sized for margin, not realism: each planted effect has to stay clear of
    // MIN_RELATIVE_EFFECT even after rounding and noise, or the fixture starts
    // failing for reasons that have nothing to do with the code under test. The
    // baseline sits at 0.78 so the two bonuses cannot push accuracy into the
    // clamp at 0.99, which would quietly compress the effect.
    const base = 0.78 - (today.shortSleep ? 0.17 : 0) + (today.activeSteps ? 0.18 : 0);
    const accuracy = Math.max(0.25, Math.min(0.99, base + (today.noise - 0.5) * 0.08));
    const correct = Math.round(accuracy * total);
    events.push({
      id: id(),
      userId,
      occurredAt: atHour(day, 19),
      type: 'BRAIN_TRAINING',
      source: SEED_SOURCE,
      metadata: {
        game: 'math',
        correct,
        total,
        durationSeconds: 90,
        score: correct * 10,
      } satisfies BrainTrainingMetadata,
    });

    const proteinRich = today.highProtein;
    events.push({
      id: id(),
      userId,
      occurredAt: atHour(day, 13),
      type: 'MEAL',
      source: SEED_SOURCE,
      metadata: {
        protein: proteinRich,
        vegetables: today.noise > 0.3,
        fruit: today.noise > 0.6,
        wholeGrains: today.noise > 0.45,
        fiber: today.noise > 0.5,
        treats: today.noise > 0.85,
        loggedVia: 'manual',
        analysis: {
          foodDescription: proteinRich ? 'Chicken, rice and greens' : 'Pasta and salad',
          grade: proteinRich ? 'A' : 'C',
          summary: 'Seeded meal.',
          confidence: 0.9,
          detectedFoods: [],
          macros: {
            calories: proteinRich ? 720 : 640,
            proteinGrams: proteinRich ? 52 + Math.round(today.noise * 14) : 20 + Math.round(today.noise * 10),
            carbsGrams: 70,
            fatGrams: 22,
          },
          nutrients: {
            protein: proteinRich,
            vegetables: today.noise > 0.3,
            fruit: today.noise > 0.6,
            wholeGrains: today.noise > 0.45,
            fiber: today.noise > 0.5,
            treats: today.noise > 0.85,
          },
        },
      } as unknown as MealMetadata,
    });

    // Training volume follows YESTERDAY's protein, which is the pairing the
    // protein insight looks for.
    const trains = today.noise > 0.25;
    if (trains) {
      const volume = (yesterday?.highProtein ? 5200 : 3400) + Math.round(today.noise * 900);
      events.push({
        id: id(),
        userId,
        occurredAt: atHour(day, 18),
        type: 'WORKOUT',
        source: SEED_SOURCE,
        metadata: {
          workoutType: 'strength',
          durationMinutes: 45,
          intensity: 'moderate',
          name: 'Seeded session',
          stats: {
            durationMinutes: 45,
            exerciseCount: 4,
            completedSets: 12,
            totalReps: 96,
            totalVolume: volume,
            muscleGroups: ['chest', 'back'],
          },
        } satisfies WorkoutMetadata,
      });
    }
  }

  return events;
};
