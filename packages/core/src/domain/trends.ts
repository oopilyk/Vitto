import type { HealthEvent, MealAnalysis, MealMetadata } from './health';
import type { BodyProfile } from './macroTargets';
import { calculateMacroTargets } from './macroTargets';
import { calorieEstimate } from './macros';
import { countedStepRows } from './nutritionSummary';
import { mealName } from './repeatableMeals';

/**
 * The Today cards' "Trends" pages: the last week or month of food and steps,
 * day by day, with the averages and the few facts worth knowing.
 *
 * Averages leave out today, which is not over yet, and days with nothing
 * logged: a day without a single meal logged is a day the log was forgotten,
 * not a day of fasting, and averaging it in as zero would make every week
 * look like a diet. Each average says how many days it is over.
 */

export type TrendWindow = 7 | 30;

const startOfDay = (at: Date): Date => new Date(at.getFullYear(), at.getMonth(), at.getDate());
const addDays = (day: Date, count: number): Date => new Date(day.getFullYear(), day.getMonth(), day.getDate() + count);
const keyOf = (day: Date): string => `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;

/** The window's days, oldest first, ending today. */
const windowDays = (today: Date, days: number): Date[] => {
  const end = startOfDay(today);
  return Array.from({ length: days }, (_, index) => addDays(end, index - days + 1));
};

const byDay = (events: readonly HealthEvent[], type: HealthEvent['type']): Map<string, HealthEvent[]> => {
  const days = new Map<string, HealthEvent[]>();
  for (const event of events) {
    if (event.type !== type) continue;
    const key = keyOf(new Date(event.occurredAt));
    const list = days.get(key);
    if (list) list.push(event);
    else days.set(key, [event]);
  }
  return days;
};

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number | null): number | null => (value === null ? null : Math.round(value));

/** How a figure compares with the window before it, as a percentage; null when either side has no data. */
const changeFrom = (now: number | null, before: number | null): number | null =>
  now === null || before === null || before === 0 ? null : Math.round(((now - before) / before) * 100);

// ---- food -------------------------------------------------------------------

export interface FoodDay {
  date: Date;
  isToday: boolean;
  meals: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
}

export interface FoodTrends {
  days: FoodDay[];
  targets: ReturnType<typeof calculateMacroTargets>;
  /** Finished days with at least one meal: what the averages are over. */
  loggedDays: number;
  average: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number; fiberGrams: number; meals: number } | null;
  /** Average calories against the window before this one, in percent. */
  caloriesChange: number | null;
  /** Days within 10% of the calorie target. */
  daysOnTarget: number;
  /** Days that reached 90% of the protein target. */
  proteinDays: number;
  /** Where the average day's calories come from, in percent of them. */
  split: { protein: number; carbs: number; fat: number } | null;
  grades: Record<MealAnalysis['grade'], number>;
  /** The meals eaten most often, most first. */
  favourites: { name: string; count: number; calories: number }[];
}

const foodDay = (date: Date, events: readonly HealthEvent[] | undefined, today: Date): FoodDay => {
  const meals = (events ?? []) as HealthEvent<MealMetadata>[];
  const total = (pick: (analysis: MealAnalysis) => number | undefined) =>
    meals.reduce((sum, meal) => sum + Math.max(0, (meal.metadata.analysis && pick(meal.metadata.analysis)) || 0), 0);
  return {
    date,
    isToday: keyOf(date) === keyOf(today),
    meals: meals.length,
    calories: Math.round(meals.reduce((sum, meal) => sum + calorieEstimate(meal.metadata.analysis?.macros), 0)),
    proteinGrams: Math.round(total((a) => a.macros.proteinGrams)),
    carbsGrams: Math.round(total((a) => a.macros.carbsGrams)),
    fatGrams: Math.round(total((a) => a.macros.fatGrams)),
    fiberGrams: Math.round(total((a) => a.macros.fiberGrams)),
  };
};

export const foodTrends = (
  events: readonly HealthEvent[],
  profile: BodyProfile,
  window: TrendWindow = 7,
  today: Date = new Date(),
): FoodTrends => {
  const meals = byDay(events, 'MEAL');
  const targets = calculateMacroTargets(profile);
  const days = windowDays(today, window).map((date) => foodDay(date, meals.get(keyOf(date)), today));
  const logged = days.filter((day) => !day.isToday && day.meals > 0);
  const avg = (pick: (day: FoodDay) => number) => round(mean(logged.map(pick)))!;
  const average = logged.length
    ? {
        calories: avg((day) => day.calories),
        proteinGrams: avg((day) => day.proteinGrams),
        carbsGrams: avg((day) => day.carbsGrams),
        fatGrams: avg((day) => day.fatGrams),
        fiberGrams: avg((day) => day.fiberGrams),
        meals: Math.round((mean(logged.map((day) => day.meals)) ?? 0) * 10) / 10,
      }
    : null;

  const before = windowDays(addDays(startOfDay(today), -window), window)
    .map((date) => foodDay(date, meals.get(keyOf(date)), today))
    .filter((day) => day.meals > 0);

  const macroKcal = average ? average.proteinGrams * 4 + average.carbsGrams * 4 + average.fatGrams * 9 : 0;
  const split =
    average && macroKcal > 0
      ? {
          protein: Math.round(((average.proteinGrams * 4) / macroKcal) * 100),
          carbs: Math.round(((average.carbsGrams * 4) / macroKcal) * 100),
          fat: Math.round(((average.fatGrams * 9) / macroKcal) * 100),
        }
      : null;

  const inWindow = days.flatMap((day) => (meals.get(keyOf(day.date)) ?? []) as HealthEvent<MealMetadata>[]);
  const grades: FoodTrends['grades'] = { A: 0, B: 0, C: 0, D: 0 };
  const counts = new Map<string, { name: string; count: number; calories: number }>();
  // Newest first, so a favourite shows its latest size.
  for (const meal of [...inWindow].reverse()) {
    const analysis = meal.metadata.analysis;
    if (!analysis) continue;
    grades[analysis.grade] += 1;
    if (meal.metadata.loggedVia === 'healthkit') continue;
    const name = mealName(analysis);
    const key = name.toLowerCase();
    const entry = counts.get(key) ?? { name, count: 0, calories: calorieEstimate(analysis.macros) };
    entry.count += 1;
    counts.set(key, entry);
  }

  return {
    days,
    targets,
    loggedDays: logged.length,
    average,
    caloriesChange: changeFrom(average?.calories ?? null, round(mean(before.map((day) => day.calories)))),
    daysOnTarget: logged.filter((day) => targets.calories > 0 && Math.abs(day.calories / targets.calories - 1) <= 0.1).length,
    proteinDays: logged.filter((day) => targets.proteinGrams > 0 && day.proteinGrams >= targets.proteinGrams * 0.9).length,
    split,
    grades,
    favourites: [...counts.values()]
      .filter((entry) => entry.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
};

// ---- steps ------------------------------------------------------------------

export interface StepDay {
  date: Date;
  isToday: boolean;
  steps: number;
}

export interface StepTrends {
  days: StepDay[];
  goal: number;
  /** Finished days with any steps: what the averages are over. */
  countedDays: number;
  average: number | null;
  /** Against the window before this one, in percent. */
  change: number | null;
  goalDays: number;
  best: StepDay | null;
  total: number;
  /** Goal days in a row, up to today (today counts once it is reached; until then the run is still alive). */
  streak: number;
  weekdayAverage: number | null;
  weekendAverage: number | null;
}

const stepsOf = (events: readonly HealthEvent[] | undefined): number =>
  countedStepRows([...(events ?? [])]).reduce((total, event) => total + (event.metadata.steps ?? 0), 0);

export const stepTrends = (
  events: readonly HealthEvent[],
  goal: number,
  window: TrendWindow = 7,
  today: Date = new Date(),
): StepTrends => {
  const rows = byDay(events, 'STEP_ACTIVITY');
  const day = (date: Date): StepDay => ({ date, isToday: keyOf(date) === keyOf(today), steps: stepsOf(rows.get(keyOf(date))) });
  const days = windowDays(today, window).map(day);
  const counted = days.filter((entry) => !entry.isToday && entry.steps > 0);
  const average = round(mean(counted.map((entry) => entry.steps)));
  const before = windowDays(addDays(startOfDay(today), -window), window).map(day).filter((entry) => entry.steps > 0);

  let streak = 0;
  const todayEntry = day(startOfDay(today));
  if (todayEntry.steps >= goal) streak += 1;
  for (let back = 1; back < 366; back += 1) {
    if (day(addDays(startOfDay(today), -back)).steps < goal) break;
    streak += 1;
  }

  const weekend = (entry: StepDay) => entry.date.getDay() === 0 || entry.date.getDay() === 6;
  return {
    days,
    goal,
    countedDays: counted.length,
    average,
    change: changeFrom(average, round(mean(before.map((entry) => entry.steps)))),
    goalDays: days.filter((entry) => entry.steps >= goal).length,
    best: days.reduce<StepDay | null>((top, entry) => (entry.steps > 0 && (!top || entry.steps > top.steps) ? entry : top), null),
    total: days.reduce((sum, entry) => sum + entry.steps, 0),
    streak,
    weekdayAverage: round(mean(counted.filter((entry) => !weekend(entry)).map((entry) => entry.steps))),
    weekendAverage: round(mean(counted.filter(weekend).map((entry) => entry.steps))),
  };
};
