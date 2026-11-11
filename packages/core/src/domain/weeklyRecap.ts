import type { HealthEvent, WorkoutMetadata } from './health';
import type { BodyProfile } from './macroTargets';
import { WATER_GOAL_ML, waterMlForDay } from './hydration';
import { BIG_LIFTS, personalRecords } from './personalRecords';
import { isRemoved } from './removedEvents';
import { foodTrends, stepTrends } from './trends';
import { weighIns } from './weightLog';

/**
 * The week in one card: the seven days ending today, against the seven before.
 * Built from the same sums as Food and Step trends, so the numbers agree with
 * the pages behind them.
 */
export interface WeeklyRecap {
  start: Date;
  end: Date;
  workouts: number;
  workoutMinutes: number;
  /** Big lifts whose best set this week beat every earlier one. */
  records: string[];
  mealDays: number;
  averageCalories: number | null;
  calorieDays: number;
  proteinDays: number;
  averageSteps: number | null;
  stepGoalDays: number;
  waterDays: number;
  mindSessions: number;
  xp: number;
  /** Trend weight now less a week ago, in kg; null without weigh-ins on both sides. */
  weightChangeKg: number | null;
  previous: { workouts: number; xp: number };
}

const DAY_MS = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const within = (event: HealthEvent, from: Date, until: Date) => {
  const at = Date.parse(event.occurredAt);
  return at >= from.getTime() && at < until.getTime() && !isRemoved(event);
};

export const weeklyRecap = (
  events: readonly HealthEvent[],
  profile: BodyProfile,
  stepGoal: number,
  today: Date = new Date(),
): WeeklyRecap => {
  const end = new Date(startOfDay(today).getTime() + DAY_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  const before = new Date(start.getTime() - 7 * DAY_MS);
  const week = events.filter((event) => within(event, start, end));
  const lastWeek = events.filter((event) => within(event, before, start));

  const workouts = week.filter((event) => event.type === 'WORKOUT');
  const xpOf = (list: readonly HealthEvent[]) =>
    list.reduce((sum, event) => sum + ((event.metadata as { xpAwarded?: number }).xpAwarded ?? 0), 0);

  // A record this week: the lift's best ever set happened inside it, and there was an earlier one to beat.
  const earlier = events.filter((event) => Date.parse(event.occurredAt) < start.getTime() && !isRemoved(event));
  const records = personalRecords(events.filter((event) => !isRemoved(event)), profile.weightUnit, BIG_LIFTS)
    .filter(({ exercise, record }) => {
      if (!record || Date.parse(record.occurredAt) < start.getTime()) return false;
      return personalRecords(earlier, profile.weightUnit, [exercise])[0]?.record !== null;
    })
    .map(({ exercise }) => exercise);

  // Food and steps over the seven whole days before today, by the same rules
  // as Food and Step trends. Today is not over: counted, it dragged the
  // averages down every time the recap was opened before dinner. (The trends'
  // own 7-day window leaves today out of 7, so it holds only six whole days.)
  const food = foodTrends(events, profile, 30, today);
  const foodWeek = food.days.filter((day) => !day.isToday).slice(-7);
  const logged = foodWeek.filter((day) => day.meals > 0);
  const targets = food.targets;
  const stepWeek = stepTrends(events, stepGoal, 30, today).days.filter((day) => !day.isToday).slice(-7);
  const stepped = stepWeek.filter((day) => day.steps > 0);

  let waterDays = 0;
  for (let day = 0; day < 7; day += 1) {
    if (waterMlForDay(events as HealthEvent[], new Date(start.getTime() + day * DAY_MS)) >= WATER_GOAL_ML) waterDays += 1;
  }

  const weights = weighIns(events as HealthEvent[]);
  const atOrBefore = (time: number) => [...weights].reverse().find((entry) => Date.parse(entry.at) <= time);
  const now = atOrBefore(end.getTime());
  const then = atOrBefore(start.getTime());

  return {
    start,
    end: new Date(end.getTime() - 1),
    workouts: workouts.length,
    workoutMinutes: workouts.reduce((sum, event) => sum + ((event.metadata as WorkoutMetadata).durationMinutes ?? 0), 0),
    records,
    mealDays: logged.length,
    averageCalories: logged.length ? Math.round(logged.reduce((sum, day) => sum + day.calories, 0) / logged.length) : null,
    calorieDays: logged.filter((day) => targets.calories > 0 && Math.abs(day.calories / targets.calories - 1) <= 0.1).length,
    proteinDays: logged.filter((day) => targets.proteinGrams > 0 && day.proteinGrams >= targets.proteinGrams * 0.9).length,
    averageSteps: stepped.length ? Math.round(stepped.reduce((sum, day) => sum + day.steps, 0) / stepped.length) : null,
    stepGoalDays: stepWeek.filter((day) => day.steps >= stepGoal).length,
    waterDays,
    mindSessions: week.filter((event) => event.type === 'BRAIN_TRAINING').length,
    xp: xpOf(week),
    weightChangeKg: now && then && now.id !== then.id ? Math.round((now.trendKg - then.trendKg) * 10) / 10 : null,
    previous: { workouts: lastWeek.filter((event) => event.type === 'WORKOUT').length, xp: xpOf(lastWeek) },
  };
};
