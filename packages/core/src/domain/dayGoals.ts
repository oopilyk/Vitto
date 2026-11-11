import { tracksArea } from './careAreas';
import type { DailyRecap } from './dailyRecap';
import type { HealthEvent } from './health';
import type { BodyProfile } from './macroTargets';
import { estimateCaloriesBurned, getEventsForDay } from './nutritionSummary';
import type { PetState } from './pet';
import type { ScheduleToday } from './trainingSchedule';

/**
 * What is left of today, as the short tokens under the pet's line on the main
 * screen: calories left, the workout (or, with a training rotation, which day of it
 * today is), steps left. Each
 * becomes a tick once it is done, and an area the person doesn't track is left
 * out (Settings > What affects your pet).
 *
 * Calories left counts what was burned, the same figure Today's Food card
 * shows. Going over is "done", never a number in red: Vitto doesn't tell
 * anyone they ate too much.
 */
export interface DayGoal {
  id: 'calories' | 'workout' | 'steps';
  label: string;
  done: boolean;
}

/** A routine name short enough for a chip: "Upper Body Hypertrophy" is "Upper Body Hy…". */
const MAX_CHIP_NAME = 14;
const shortName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed.length <= MAX_CHIP_NAME ? trimmed : `${trimmed.slice(0, MAX_CHIP_NAME - 1).trimEnd()}…`;
};

/**
 * The day's calories count as done within a tenth of the target of it, or past
 * it. The banner and Today's Food card both ask this, so they never disagree.
 */
export const caloriesMet = (target: number, consumed: number, burned: number): boolean =>
  target > 0 && target - consumed + burned <= target * 0.1;

export const dayGoals = (
  recap: DailyRecap,
  {
    events,
    pet,
    day = new Date(),
    rotation,
  }: {
    events: readonly HealthEvent[];
    profile: BodyProfile;
    pet: PetState;
    day?: Date;
    /** Today in their training rotation (scheduleDayOn), which decides the workout chip when they have one. */
    rotation?: ScheduleToday | null;
  },
): DayGoal[] => {
  const goals: DayGoal[] = [];

  if (tracksArea(pet.careAreas, 'nutrition') && recap.food.targets.calories > 0) {
    const { calories: target } = recap.food.targets;
    const { calories: consumed } = recap.food.consumed;
    const burned = estimateCaloriesBurned(getEventsForDay([...events], day));
    const left = Math.round(target - consumed + burned);
    goals.push(
      caloriesMet(target, consumed, burned)
        ? { id: 'calories', label: 'Calories', done: true }
        : { id: 'calories', label: `${left.toLocaleString('en-US')} kcal left`, done: false },
    );
  }

  if (tracksArea(pet.careAreas, 'training')) {
    if (rotation) {
      // Where they are in their rotation: "Day 2 · Push", ticked once trained;
      // a rest day is done by resting.
      const what = rotation.day.kind === 'rest' ? 'Rest' : shortName(rotation.template?.name ?? 'Workout');
      goals.push({ id: 'workout', label: `Day ${rotation.index + 1} · ${what}`, done: rotation.day.kind === 'rest' || recap.gym.done });
    } else {
      goals.push({ id: 'workout', label: 'Workout', done: recap.gym.done });
    }
  }

  if (tracksArea(pet.careAreas, 'movement') && recap.outdoors.goal > 0) {
    const left = recap.outdoors.goal - recap.outdoors.steps;
    goals.push(
      left > 0
        ? { id: 'steps', label: `${left.toLocaleString('en-US')} steps left`, done: false }
        : { id: 'steps', label: 'Steps', done: true },
    );
  }

  return goals;
};
