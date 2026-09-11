import type { HealthEvent, MealMetadata, StepMetadata, WorkoutMetadata } from './health';
import { calorieEstimate, nonNegative } from './macros';

export interface MacroTotals {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

const ZERO_MACROS: MacroTotals = { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 };

export const isSameDay = (isoDate: string, reference: Date): boolean =>
  new Date(isoDate).toDateString() === reference.toDateString();

export const getEventsForDay = (events: HealthEvent[], day: Date): HealthEvent[] =>
  events.filter((event) => isSameDay(event.occurredAt, day));

export const getMealsForDay = (events: HealthEvent[], day: Date): HealthEvent<MealMetadata>[] =>
  events.filter(
    (event): event is HealthEvent<MealMetadata> =>
      event.type === 'MEAL' && isSameDay(event.occurredAt, day),
  );

export const sumMealMacros = (mealEvents: HealthEvent<MealMetadata>[]): MacroTotals =>
  mealEvents.reduce((total, event) => {
    const macros = event.metadata.analysis?.macros;
    if (!macros) return total;
    const proteinGrams = nonNegative(macros.proteinGrams);
    const carbsGrams = nonNegative(macros.carbsGrams);
    const fatGrams = nonNegative(macros.fatGrams);
    return {
      calories: total.calories + calorieEstimate(macros),
      proteinGrams: total.proteinGrams + proteinGrams,
      carbsGrams: total.carbsGrams + carbsGrams,
      fatGrams: total.fatGrams + fatGrams,
    };
  }, ZERO_MACROS);

const CALORIES_BURNED_PER_WORKOUT_MINUTE = 7;
const CALORIES_BURNED_PER_STEP = 0.04;

/**
 * The day's total steps: every `STEP_ACTIVITY` event for the day, summed.
 * Safe because a device only ever holds one such event per day for the
 * HealthKit auto-sync flow — a re-sync updates that same event's count in
 * place (`replaceEvent`, see App.tsx's `syncSteps`) rather than adding a new
 * one, so re-syncing a cumulative daily reading can never be double-counted
 * here. A second, genuinely separate `STEP_ACTIVITY` for the same day (a
 * manual log, seeded test data) is real additional activity and should add.
 */
export const stepsForDay = (dayEvents: HealthEvent[]): number =>
  dayEvents
    .filter((event) => event.type === 'STEP_ACTIVITY')
    .reduce((total, event) => total + ((event.metadata as StepMetadata).steps ?? 0), 0);

/**
 * Same aggregation as `stepsForDay`, for whichever `STEP_ACTIVITY` events
 * carry a real Apple Health `caloriesBurned` reading (active energy burned,
 * queried alongside steps — see `HealthKitProvider.getTodaySteps`). `null`
 * when nothing today reports one, so the caller can fall back to
 * `estimateCaloriesBurned` rather than silently showing a zero.
 */
export const healthCaloriesBurnedForDay = (dayEvents: HealthEvent[]): number | null => {
  const withReading = dayEvents.filter(
    (event): event is HealthEvent<StepMetadata> =>
      event.type === 'STEP_ACTIVITY' && (event.metadata as StepMetadata).caloriesBurned !== undefined,
  );
  if (withReading.length === 0) return null;
  return Math.round(
    withReading.reduce((total, event) => total + (event.metadata.caloriesBurned ?? 0), 0),
  );
};

/**
 * The estimate used when Apple Health hasn't reported real active-energy data
 * for the day (Android, no HealthKit permission, or a manual/mock step log).
 */
export const estimateCaloriesBurned = (dayEvents: HealthEvent[]): number => {
  const workoutMinutes = dayEvents
    .filter((event) => event.type === 'WORKOUT')
    .reduce((total, event) => total + ((event.metadata as WorkoutMetadata).durationMinutes ?? 0), 0);
  return Math.round(
    workoutMinutes * CALORIES_BURNED_PER_WORKOUT_MINUTE +
      stepsForDay(dayEvents) * CALORIES_BURNED_PER_STEP,
  );
};

/**
 * The figure to actually show: real Apple Health data when today has it,
 * the formula estimate otherwise. `fromHealth` lets the UI label which one
 * it's looking at.
 */
export const caloriesBurnedForDay = (
  dayEvents: HealthEvent[],
): { calories: number; fromHealth: boolean } => {
  const fromHealth = healthCaloriesBurnedForDay(dayEvents);
  return fromHealth !== null
    ? { calories: fromHealth, fromHealth: true }
    : { calories: estimateCaloriesBurned(dayEvents), fromHealth: false };
};
