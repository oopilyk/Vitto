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

export const estimateCaloriesBurned = (dayEvents: HealthEvent[]): number => {
  const workoutMinutes = dayEvents
    .filter((event) => event.type === 'WORKOUT')
    .reduce((total, event) => total + ((event.metadata as WorkoutMetadata).durationMinutes ?? 0), 0);
  const steps = dayEvents
    .filter((event) => event.type === 'STEP_ACTIVITY')
    .reduce((total, event) => total + ((event.metadata as StepMetadata).steps ?? 0), 0);
  return Math.round(
    workoutMinutes * CALORIES_BURNED_PER_WORKOUT_MINUTE + steps * CALORIES_BURNED_PER_STEP,
  );
};
