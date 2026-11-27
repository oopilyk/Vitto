import { tracksArea } from './careAreas';
import type { DailyRecap } from './dailyRecap';
import type { HealthEvent } from './health';
import type { BodyProfile } from './macroTargets';
import { estimateCaloriesBurned, getEventsForDay } from './nutritionSummary';
import type { PetState } from './pet';
import type { ScheduleToday } from './trainingSchedule';
import { formatLocale, msg, t, tx } from '../i18n';

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
 * On a fat-loss goal, how much of the target counts as a full day of eating.
 * Plenty of people cutting want to land under their number, not on it, so the
 * day is done once they have eaten a real day's worth: nothing nudges them to
 * eat the rest to tick it.
 */
export const LOSE_CALORIES_FLOOR = 0.75;

/**
 * The day's calories count as done within a tenth of the target of it, or past
 * it; on a fat-loss goal, from three quarters of it (LOSE_CALORIES_FLOOR). The
 * banner and Today's Food card both ask this, so they never disagree.
 */
export const caloriesMet = (target: number, consumed: number, burned: number, goal?: BodyProfile['goal']): boolean =>
  target > 0 && (target - consumed + burned <= target * 0.1 || (goal === 'lose' && consumed >= target * LOSE_CALORIES_FLOOR));

export const dayGoals = (
  recap: DailyRecap,
  {
    events,
    profile,
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
      caloriesMet(target, consumed, burned, profile.goal)
        ? { id: 'calories', label: t('Calories'), done: true }
        : { id: 'calories', label: t('{calories} kcal left', { calories: left.toLocaleString(formatLocale()) }), done: false },
    );
  }

  if (tracksArea(pet.careAreas, 'training')) {
    if (rotation) {
      // Where they are in their rotation: "Day 2 · Push", ticked once trained;
      // a rest day is done by resting.
      // A routine's name is stored in English (a built-in one) or as it was typed: translated here, where it is shown.
      const what = rotation.day.kind === 'rest' ? tx('a rest day in a training plan', 'Rest') : shortName(t(rotation.template?.name ?? msg('Workout')));
      goals.push({ id: 'workout', label: t('Day {day} · {what}', { day: rotation.index + 1, what }), done: rotation.day.kind === 'rest' || recap.gym.trainingDone });
    } else {
      goals.push({ id: 'workout', label: t('Workout'), done: recap.gym.trainingDone });
    }
  }

  if (tracksArea(pet.careAreas, 'movement') && recap.outdoors.goal > 0) {
    const left = recap.outdoors.goal - recap.outdoors.steps;
    goals.push(
      left <= 0
        ? { id: 'steps', label: t('Steps'), done: true }
        : // Half an hour of runs or walks logged as workouts meets the day's movement too.
          recap.outdoors.cardioDone
          ? { id: 'steps', label: t('Cardio'), done: true }
          : { id: 'steps', label: t('{steps} steps left', { steps: left.toLocaleString(formatLocale()) }), done: false },
    );
  }

  return goals;
};
