import type { BodyProfile } from './macroTargets';
import { calculateMacroTargets } from './macroTargets';
import type { BrainTrainingMetadata, HealthEvent, MealMetadata, WorkoutMetadata } from './health';
import { totalPetXp, XP_PER_LEVEL, type PetState } from './pet';
import {
  type MacroTotals,
  caloriesBurnedForDay,
  getMealsForDay,
  isSameDay,
  stepsForDay,
  sumMealMacros,
} from './nutritionSummary';
import { toDateKey } from './streaks';

/**
 * ONE derivation of the daily recap, from the real event log. Every number the
 * Today screen shows comes from here — no component recalculates calories, XP
 * or steps on its own. Pure: hand it the same `events` the rest of the app
 * holds and it folds them into the four pillars plus the day's XP.
 *
 * Day boundary: `isSameDay` (local calendar day of `occurredAt` vs `day`), the
 * same rule the rest of the nutrition layer uses, so "today" never disagrees
 * between the dashboard streak and this screen.
 */

export type Pillar = 'gym' | 'outdoors' | 'mind' | 'food';

/** The XP the engine actually granted an event, stamped onto its metadata at
 *  log time (see `recordEvent`). Absent on events logged before that existed. */
const xpOf = (event: HealthEvent): number =>
  Math.max(0, Math.round((event.metadata as { xpAwarded?: number }).xpAwarded ?? 0));

const PILLAR_OF: Partial<Record<HealthEvent['type'], Pillar>> = {
  WORKOUT: 'gym',
  STEP_ACTIVITY: 'outdoors',
  BRAIN_TRAINING: 'mind',
  MEAL: 'food',
};

export interface GymRecap {
  done: boolean;
  workoutCount: number;
  totalMinutes: number;
  exerciseCount: number;
  /** The last workout's name, if it had one — for the "Upper Body" style line. */
  lastName?: string;
  xp: number;
}

export interface OutdoorsRecap {
  steps: number;
  goal: number;
  percent: number;
  goalReached: boolean;
  xp: number;
  /** Calories burned today, from Apple Health when available. */
  caloriesBurned: number;
  /** Whether `caloriesBurned` is a real Apple Health reading rather than the workout+steps estimate. */
  caloriesBurnedFromHealth: boolean;
}

export interface MindRecap {
  sessionCount: number;
  bestScore: number;
  wordPuzzleDone: boolean;
  xp: number;
}

export interface FoodRecap {
  mealCount: number;
  consumed: MacroTotals;
  targets: MacroTotals;
  caloriePercent: number;
  /** At least one meal has no usable analysis — show the count honestly, not a
   *  falsely precise calorie figure. */
  someMealsUnanalyzed: boolean;
}

export interface RecapActivity {
  id: string;
  label: string;
}

export interface DailyRecap {
  dayKey: string;
  /**
   * The xp earned today. Read from the real progression system, not a copy of
   * it: with `dayStartTotalXp` given, this is the pet's current total xp minus
   * its total at the start of the day — a diff of the actual counter, so it
   * can never disagree with the pet's own level/xp. Without an anchor (e.g. no
   * reading has been taken yet), falls back to summing today's stamped
   * per-event xp, which under-counts any event logged before that stamp
   * existed.
   */
  xp: number;
  xpByPillar: Record<Pillar, number>;
  gym: GymRecap;
  outdoors: OutdoorsRecap;
  mind: MindRecap;
  food: FoodRecap;
  /** Overall daily progress, 0–100: the mean of the four pillars' own progress. */
  dailyProgress: number;
  /** The meaningful, aggregated events — never one row per data update. */
  activity: RecapActivity[];
  /** For the pet-connection line: where the level bar sits after today. */
  levelProgress: { level: number; xpIntoLevel: number; xpForLevel: number };
}

export interface DailyRecapInput {
  events: HealthEvent[];
  profile: BodyProfile;
  pet: PetState;
  stepGoal: number;
  day?: Date;
  /**
   * The pet's total xp (`totalPetXp`) as of the start of `day`, if a reading
   * has been taken. Preferred source for `xp` — see the field's own doc.
   */
  dayStartTotalXp?: number;
}

const mindEventsForDay = (events: HealthEvent[], day: Date): HealthEvent<BrainTrainingMetadata>[] => {
  const dayKey = toDateKey(day);
  return events.filter((event): event is HealthEvent<BrainTrainingMetadata> => {
    if (event.type !== 'BRAIN_TRAINING') return false;
    const puzzleDate = (event.metadata as BrainTrainingMetadata).puzzleDate;
    return puzzleDate ? puzzleDate === dayKey : isSameDay(event.occurredAt, day);
  });
};

export function buildDailyRecap({
  events,
  profile,
  pet,
  stepGoal,
  day = new Date(),
  dayStartTotalXp,
}: DailyRecapInput): DailyRecap {
  const dayKey = toDateKey(day);
  const todays = events.filter((event) => isSameDay(event.occurredAt, day));

  // Per-pillar chips still come from each event's own stamp -- attributing xp
  // to a pillar needs per-event data an anchor diff cannot give.
  const xpByPillar: Record<Pillar, number> = { gym: 0, outdoors: 0, mind: 0, food: 0 };
  let xpFromEvents = 0;
  for (const event of todays) {
    const earned = xpOf(event);
    xpFromEvents += earned;
    const pillar = PILLAR_OF[event.type];
    if (pillar) xpByPillar[pillar] += earned;
  }
  const xp =
    dayStartTotalXp !== undefined
      ? Math.max(0, totalPetXp(pet) - dayStartTotalXp)
      : xpFromEvents;

  // --- Gym --------------------------------------------------------------
  const workouts = todays.filter(
    (event): event is HealthEvent<WorkoutMetadata> => event.type === 'WORKOUT',
  );
  const gym: GymRecap = {
    done: workouts.length > 0,
    workoutCount: workouts.length,
    totalMinutes: workouts.reduce(
      (total, event) =>
        total + (event.metadata.stats?.durationMinutes ?? event.metadata.durationMinutes ?? 0),
      0,
    ),
    exerciseCount: workouts.reduce(
      (total, event) =>
        total + (event.metadata.stats?.exerciseCount ?? event.metadata.exercises?.length ?? 0),
      0,
    ),
    lastName: workouts[0]?.metadata.name,
    xp: xpByPillar.gym,
  };

  // --- Outdoors --------------------------------------------------------
  const steps = stepsForDay(todays);
  const burned = caloriesBurnedForDay(todays);
  const outdoors: OutdoorsRecap = {
    steps,
    goal: stepGoal,
    percent: stepGoal > 0 ? Math.round((steps / stepGoal) * 100) : 0,
    goalReached: steps >= stepGoal && stepGoal > 0,
    xp: xpByPillar.outdoors,
    caloriesBurned: burned.calories,
    caloriesBurnedFromHealth: burned.fromHealth,
  };

  // --- Mind ----------------------------------------------------------
  const mindEvents = mindEventsForDay(events, day);
  const mind: MindRecap = {
    sessionCount: mindEvents.length,
    bestScore: mindEvents.reduce((best, event) => Math.max(best, event.metadata.score ?? 0), 0),
    wordPuzzleDone: mindEvents.some((event) => event.metadata.game === 'wordPuzzle'),
    xp: xpByPillar.mind,
  };

  // --- Food --------------------------------------------------------
  const meals = getMealsForDay(events, day);
  const consumed = sumMealMacros(meals);
  const targets = calculateMacroTargets(profile);
  const someMealsUnanalyzed = meals.some((event) => {
    const macros = (event.metadata as MealMetadata).analysis?.macros;
    return (
      !macros || (macros.proteinGrams === 0 && macros.carbsGrams === 0 && macros.fatGrams === 0)
    );
  });
  const food: FoodRecap = {
    mealCount: meals.length,
    consumed,
    targets,
    caloriePercent:
      targets.calories > 0 ? Math.round((consumed.calories / targets.calories) * 100) : 0,
    someMealsUnanalyzed,
  };

  // --- Overall progress: mean of the four pillars' own daily progress --
  const gymProgress = gym.done ? 100 : 0;
  const outdoorsProgress = Math.min(100, outdoors.percent);
  const mindProgress = mind.sessionCount > 0 ? 100 : 0;
  const foodProgress = meals.length > 0 ? Math.min(100, food.caloriePercent) : 0;
  const dailyProgress = Math.round(
    (gymProgress + outdoorsProgress + mindProgress + foodProgress) / 4,
  );

  // --- Meaningful activity, aggregated ------------------------------
  const activity: RecapActivity[] = [];
  if (gym.done) {
    activity.push({
      id: 'gym',
      label:
        gym.workoutCount > 1
          ? `Completed ${gym.workoutCount} workouts`
          : gym.lastName
            ? `Completed ${gym.lastName}`
            : 'Completed a workout',
    });
  }
  if (meals.length > 0) {
    activity.push({
      id: 'food',
      label: meals.length > 1 ? `Logged ${meals.length} meals` : 'Logged a meal',
    });
  }
  if (mind.sessionCount > 0) {
    activity.push({
      id: 'mind',
      label:
        mind.sessionCount > 1
          ? `Completed ${mind.sessionCount} mind sessions`
          : 'Completed a mind session',
    });
  }
  if (steps > 0) {
    activity.push({
      id: 'steps',
      label: outdoors.goalReached
        ? `Reached the ${stepGoal.toLocaleString()}-step goal`
        : `Walked ${steps.toLocaleString()} steps`,
    });
  }
  // Also surface meaningful non-pillar events (sleep, screen time) if the engine
  // gave them XP — they still count toward "how I took care of myself".
  for (const event of todays) {
    if (event.type === 'SLEEP' && xpOf(event) > 0)
      activity.push({ id: event.id, label: 'Logged sleep' });
    if (event.type === 'SCREEN_TIME' && xpOf(event) > 0)
      activity.push({ id: event.id, label: 'Logged screen time' });
  }

  return {
    dayKey,
    xp,
    xpByPillar,
    gym,
    outdoors,
    mind,
    food,
    dailyProgress,
    activity,
    levelProgress: { level: pet.level, xpIntoLevel: pet.xp, xpForLevel: XP_PER_LEVEL },
  };
}
