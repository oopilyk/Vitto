import { tracksArea } from './careAreas';
import type { DailyRecap } from './dailyRecap';
import type { HealthEvent } from './health';
import type { BodyProfile } from './macroTargets';
import { estimateCaloriesBurned, getEventsForDay } from './nutritionSummary';
import type { PetState } from './pet';

/**
 * What is left of today, as the short tokens under the pet's line on the main
 * screen: calories left, whether a workout is still due, steps left. Each
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

const WEEK_MS = 7 * 86_400_000;

/**
 * The day's calories count as done within a tenth of the target of it, or past
 * it. The banner and Today's Food card both ask this, so they never disagree.
 */
export const caloriesMet = (target: number, consumed: number, burned: number): boolean =>
  target > 0 && target - consumed + burned <= target * 0.1;

export const dayGoals = (
  recap: DailyRecap,
  { events, profile, pet, day = new Date() }: { events: readonly HealthEvent[]; profile: BodyProfile; pet: PetState; day?: Date },
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
    if (recap.gym.done) {
      goals.push({ id: 'workout', label: 'Workout', done: true });
    } else {
      // The week's target already met: today is a rest day, nothing is due.
      // Days trained, not workouts: a lift and a walk on one day is one day.
      const since = day.getTime() - WEEK_MS;
      const thisWeek = new Set(
        events
          .filter((event) => event.type === 'WORKOUT' && Date.parse(event.occurredAt) > since)
          .map((event) => new Date(event.occurredAt).toDateString()),
      ).size;
      const target = Math.max(1, Math.round(profile.trainingDaysPerWeek));
      goals.push(thisWeek >= target ? { id: 'workout', label: 'Rest day', done: true } : { id: 'workout', label: 'Workout due', done: false });
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
