import type {
  BrainTrainingMetadata,
  HealthEvent,
  MealMetadata,
  SleepMetadata,
  StepMetadata,
  WorkoutMetadata,
} from './health';
import { type MacroTotals, sumMealMacros } from './nutritionSummary';
import { type EventDateKey, toDateKey } from './streaks';

// ---------------------------------------------------------------------------
// Insights: what the collected health data says about the user.
//
// Every other domain module turns behaviour into pet stats. This one turns it into
// plain-English findings the pet can pass on -- "sharper puzzle days seem to follow
// your longer nights". Pure functions over `HealthEvent[]`, like `streaks.ts`: no I/O,
// no platform code, and `today` is always an argument.
//
// The statistics are deliberately modest. Days are split into two groups around a
// threshold and their means compared. Nothing is emitted unless both groups are
// populated, the overall sample is large enough, and the difference is big enough to
// be worth mentioning. Findings are worded as associations, never causes.
// ---------------------------------------------------------------------------

/** Days on or after `today - INSIGHT_LOOKBACK_DAYS` are considered; older data is habits the user may have left behind. */
export const INSIGHT_LOOKBACK_DAYS = 90;
/** Fewer days than this in either group and a comparison says nothing. */
export const MIN_DAYS_PER_GROUP = 5;
/** Fewer paired days than this overall and a comparison says nothing. */
export const MIN_PAIRED_DAYS = 12;
/** Relative difference of group means below this is treated as noise and not reported. */
export const MIN_RELATIVE_EFFECT = 0.1;
/** A night shorter than six hours counts as a short night. */
export const SHORT_SLEEP_MINUTES = 360;
/** A day with at least this many steps counts as an active day. */
export const ACTIVE_STEPS = 8000;
/**
 * Protein days are split at this quantile of the user's own paired days -- the median.
 * Protein needs scale with body size, so a fixed gram cutoff would put a small eater
 * entirely in one group and a large one entirely in the other. Splitting at the user's
 * own median keeps both groups populated whenever there are enough paired days at all.
 */
export const PROTEIN_SPLIT_QUANTILE = 0.5;

/** How many meals on a day carried each nutrient flag. */
export interface MealSignalCounts {
  protein: number;
  vegetables: number;
  fruit: number;
  wholeGrains: number;
  fiber: number;
  treats: number;
}

/**
 * One day of the user's health, one field per kind of measurement. A field is absent
 * when the day has no measurement of that kind -- absence is never written as 0. A
 * logged workout that moved no weight is a `workoutVolume` of 0; a rest day has none.
 */
export interface DailyHealthRow {
  dateKey: string;
  /** Minutes asleep in the night that ended on this morning. Summed when a night arrives in pieces. */
  asleepMinutes?: number;
  /** Correct answers over questions asked across the day's brain sessions, 0..1. */
  mindAccuracy?: number;
  /** Questions asked across the day's brain sessions -- the weight behind `mindAccuracy`. */
  mindQuestions?: number;
  /** Highest step total reported for the day. Each sync carries the day's running total, so summing would double count. */
  steps?: number;
  /** Loaded volume (Σ weight×reps) across the day's workouts that recorded stats. */
  workoutVolume?: number;
  /** Macros summed across the day's analysed meals. Absent when no meal carried an analysis. */
  macros?: MacroTotals;
  /** Present whenever at least one meal was logged, even if every flag is false. */
  mealSignals?: MealSignalCounts;
}

export type InsightKind = 'sleep-mind' | 'protein-volume' | 'steps-mind';

export type InsightDirection = 'higher' | 'lower';

export interface InsightGroup {
  days: number;
  mean: number;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  /** The finding in the pet's voice, one sentence. */
  headline: string;
  /** The finding in plain numbers: which days, the group means, how many days. */
  detail: string;
  /** Paired days behind the comparison, across both groups. */
  sampleDays: number;
  /** How the "under threshold" group's mean sits relative to the "at or over" group's. */
  direction: InsightDirection;
  /** `(underMean - overMean) / overMean`, so -0.14 reads as "14% lower". */
  effectSize: number;
  /** The plain group means and sizes the sentence was written from. */
  under: InsightGroup;
  over: InsightGroup;
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Which day an event counts toward. Sleep is stamped to the morning it ended (`night`),
 * a WordPuzzle session to its `puzzleDate`, and a step total to its `date` -- the same
 * attribution the dashboard and streaks use, so a puzzle or a night carried past
 * midnight lands on the day it belongs to.
 */
export const insightDateKey: EventDateKey = (event) => {
  const fallback = () => toDateKey(new Date(event.occurredAt));
  const stamped = (key: string | undefined) => (key && DAY_KEY_PATTERN.test(key) ? key : fallback());
  switch (event.type) {
    case 'SLEEP':
      return stamped((event.metadata as SleepMetadata | undefined)?.night);
    case 'BRAIN_TRAINING':
      return stamped((event.metadata as BrainTrainingMetadata | undefined)?.puzzleDate);
    case 'STEP_ACTIVITY':
      return stamped((event.metadata as StepMetadata | undefined)?.date);
    default:
      return fallback();
  }
};

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const compareEvents = (a: HealthEvent, b: HealthEvent): number => {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Sum across a numeric field, or `undefined` when nothing contributed. */
const sumOrAbsent = (values: number[]): number | undefined =>
  values.length ? values.reduce((total, value) => total + value, 0) : undefined;

const buildRow = (dateKey: string, dayEvents: HealthEvent[]): DailyHealthRow => {
  const row: DailyHealthRow = { dateKey };

  const asleep = dayEvents
    .filter((event) => event.type === 'SLEEP')
    .map((event) => (event.metadata as SleepMetadata | undefined)?.asleepMinutes)
    .filter(isCount);
  const asleepMinutes = sumOrAbsent(asleep);
  if (asleepMinutes !== undefined) row.asleepMinutes = asleepMinutes;

  // Weighted by questions asked: a one-question warm-up must not count as much as a
  // twenty-question round, which a mean of per-session accuracies would let it do.
  let correct = 0;
  let total = 0;
  for (const event of dayEvents) {
    if (event.type !== 'BRAIN_TRAINING') continue;
    const metadata = event.metadata as BrainTrainingMetadata | undefined;
    if (!metadata || !isCount(metadata.correct) || !isCount(metadata.total) || metadata.total === 0) continue;
    correct += Math.min(metadata.correct, metadata.total);
    total += metadata.total;
  }
  if (total > 0) {
    row.mindAccuracy = correct / total;
    row.mindQuestions = total;
  }

  const stepTotals = dayEvents
    .filter((event) => event.type === 'STEP_ACTIVITY')
    .map((event) => (event.metadata as StepMetadata | undefined)?.steps)
    .filter(isCount);
  if (stepTotals.length) row.steps = Math.max(...stepTotals);

  const volumes = dayEvents
    .filter((event) => event.type === 'WORKOUT')
    .map((event) => (event.metadata as WorkoutMetadata | undefined)?.stats?.totalVolume)
    .filter(isCount);
  const workoutVolume = sumOrAbsent(volumes);
  if (workoutVolume !== undefined) row.workoutVolume = workoutVolume;

  const meals = dayEvents.filter(
    (event): event is HealthEvent<MealMetadata> => event.type === 'MEAL' && !!event.metadata,
  );
  if (meals.length) {
    row.mealSignals = meals.reduce<MealSignalCounts>(
      (counts, meal) => ({
        protein: counts.protein + (meal.metadata.protein ? 1 : 0),
        vegetables: counts.vegetables + (meal.metadata.vegetables ? 1 : 0),
        fruit: counts.fruit + (meal.metadata.fruit ? 1 : 0),
        wholeGrains: counts.wholeGrains + (meal.metadata.wholeGrains ? 1 : 0),
        fiber: counts.fiber + (meal.metadata.fiber ? 1 : 0),
        treats: counts.treats + (meal.metadata.treats ? 1 : 0),
      }),
      { protein: 0, vegetables: 0, fruit: 0, wholeGrains: 0, fiber: 0, treats: 0 },
    );
    const analysed = meals.filter((meal) => meal.metadata.analysis?.macros);
    if (analysed.length) row.macros = sumMealMacros(analysed);
  }

  return row;
};

/**
 * One row per day that has any data at all, sorted by date. Events are sorted before
 * they are folded in so the result does not depend on the order they arrived in.
 */
export const aggregateDailyHealth = (
  events: HealthEvent[],
  keyOf: EventDateKey = insightDateKey,
): DailyHealthRow[] => {
  const byDay = new Map<string, HealthEvent[]>();
  for (const event of [...events].sort(compareEvents)) {
    const key = keyOf(event);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }
  return Array.from(byDay.keys())
    .sort()
    .map((dateKey) => buildRow(dateKey, byDay.get(dateKey)!));
};

const shiftDateKey = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toDateKey(new Date(year, month - 1, day + days));
};

/** A day's predictor alongside the outcome it is being compared with. */
export interface PairedDay {
  dateKey: string;
  predictor: number;
  outcome: number;
}

const mean = (values: number[]): number => values.reduce((total, value) => total + value, 0) / values.length;

const round = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** The value at `quantile` of the sorted list, interpolating between neighbours. */
const quantileOf = (values: number[], quantile: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

export interface GroupComparison {
  under: InsightGroup;
  over: InsightGroup;
  sampleDays: number;
  /** `(under.mean - over.mean) / over.mean`. */
  effectSize: number;
  direction: InsightDirection;
}

/**
 * Splits paired days at `threshold` on the predictor (under vs at-or-over) and compares
 * the outcome means. Returns null when either group is too small, the overall sample
 * is too small, the relative difference is below `MIN_RELATIVE_EFFECT`, or the baseline
 * mean is zero (no relative figure exists).
 */
export const compareGroups = (pairs: PairedDay[], threshold: number): GroupComparison | null => {
  if (pairs.length < MIN_PAIRED_DAYS) return null;
  const underDays = pairs.filter((pair) => pair.predictor < threshold);
  const overDays = pairs.filter((pair) => pair.predictor >= threshold);
  if (underDays.length < MIN_DAYS_PER_GROUP || overDays.length < MIN_DAYS_PER_GROUP) return null;

  const underMean = mean(underDays.map((pair) => pair.outcome));
  const overMean = mean(overDays.map((pair) => pair.outcome));
  if (overMean === 0) return null;

  // Gate on the exact figure; rounding is for the output only, so a 9.95% gap cannot
  // round its way up to the 10% floor.
  const relativeEffect = (underMean - overMean) / overMean;
  if (Math.abs(relativeEffect) < MIN_RELATIVE_EFFECT) return null;
  const effectSize = round(relativeEffect, 3);

  return {
    under: { days: underDays.length, mean: round(underMean, 4) },
    over: { days: overDays.length, mean: round(overMean, 4) },
    sampleDays: pairs.length,
    effectSize,
    direction: effectSize < 0 ? 'lower' : 'higher',
  };
};

const rowsByKey = (rows: DailyHealthRow[]): Map<string, DailyHealthRow> =>
  new Map(rows.map((row) => [row.dateKey, row]));

/**
 * Pairs each row's `predictor` with the `outcome` of the row `outcomeOffsetDays` later.
 * Days missing either side are left out -- never counted as zero.
 */
export const pairDays = (
  rows: DailyHealthRow[],
  predictor: (row: DailyHealthRow) => number | undefined,
  outcome: (row: DailyHealthRow) => number | undefined,
  outcomeOffsetDays = 0,
): PairedDay[] => {
  const byKey = rowsByKey(rows);
  const pairs: PairedDay[] = [];
  for (const row of rows) {
    const predictorValue = predictor(row);
    if (predictorValue === undefined) continue;
    const outcomeRow = outcomeOffsetDays ? byKey.get(shiftDateKey(row.dateKey, outcomeOffsetDays)) : row;
    const outcomeValue = outcomeRow ? outcome(outcomeRow) : undefined;
    if (outcomeValue === undefined) continue;
    pairs.push({ dateKey: row.dateKey, predictor: predictorValue, outcome: outcomeValue });
  }
  return pairs;
};

const percent = (effectSize: number): string => `${Math.round(Math.abs(effectSize) * 100)}%`;

/** 8000 -> "8,000" without leaning on the runtime's locale tables. */
const withThousands = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const dayCount = (days: number): string => `${days} day${days === 1 ? '' : 's'}`;

/**
 * Sleep in the night that ended on a morning, against the mind accuracy of that same
 * day -- which is the day after the night, since `night` is stamped to the morning.
 */
export const compareSleepToMind = (rows: DailyHealthRow[]): Insight | null => {
  const pairs = pairDays(rows, (row) => row.asleepMinutes, (row) => row.mindAccuracy);
  const comparison = compareGroups(pairs, SHORT_SLEEP_MINUTES);
  if (!comparison) return null;
  const hours = SHORT_SLEEP_MINUTES / 60;
  return {
    id: `sleep-mind-${comparison.direction}`,
    kind: 'sleep-mind',
    headline:
      comparison.direction === 'lower'
        ? 'Your sharper puzzle days seem to follow your longer nights.'
        : 'Your sharper puzzle days have tended to follow your shorter nights, oddly enough.',
    detail: `On days after less than ${hours} hours of sleep, your mind accuracy averaged ${percent(comparison.effectSize)} ${comparison.direction} (${dayCount(comparison.sampleDays)}: ${comparison.under.days} short nights, ${comparison.over.days} fuller).`,
    ...comparison,
  };
};

/** Protein eaten on one day, against the loaded volume of the next day's workouts. */
export const compareProteinToVolume = (rows: DailyHealthRow[]): Insight | null => {
  const pairs = pairDays(rows, (row) => row.macros?.proteinGrams, (row) => row.workoutVolume, 1);
  if (pairs.length < MIN_PAIRED_DAYS) return null;
  const threshold = quantileOf(pairs.map((pair) => pair.predictor), PROTEIN_SPLIT_QUANTILE);
  const comparison = compareGroups(pairs, threshold);
  if (!comparison) return null;
  return {
    id: `protein-volume-${comparison.direction}`,
    kind: 'protein-volume',
    headline:
      comparison.direction === 'lower'
        ? 'Your bigger lifting days seem to follow your higher-protein days.'
        : 'Your bigger lifting days have tended to follow your lighter-protein days, oddly enough.',
    detail: `The day after eating under about ${Math.round(threshold)}g of protein, your workout volume averaged ${percent(comparison.effectSize)} ${comparison.direction} (${dayCount(comparison.sampleDays)}: ${comparison.under.days} lighter, ${comparison.over.days} higher-protein).`,
    ...comparison,
  };
};

/** Steps on a day, against the mind accuracy of the same day. */
export const compareStepsToMind = (rows: DailyHealthRow[]): Insight | null => {
  const pairs = pairDays(rows, (row) => row.steps, (row) => row.mindAccuracy);
  const comparison = compareGroups(pairs, ACTIVE_STEPS);
  if (!comparison) return null;
  return {
    id: `steps-mind-${comparison.direction}`,
    kind: 'steps-mind',
    headline:
      comparison.direction === 'lower'
        ? 'Your sharper puzzle days seem to be the ones we explored more.'
        : 'Your sharper puzzle days seem to be the quieter ones, oddly enough.',
    detail: `On days under ${withThousands(ACTIVE_STEPS)} steps, your mind accuracy averaged ${percent(comparison.effectSize)} ${comparison.direction} (${dayCount(comparison.sampleDays)}: ${comparison.under.days} quieter, ${comparison.over.days} active).`,
    ...comparison,
  };
};

/** Fixed order: the list is stable across calls and across reorderings of the input. */
const COMPARISONS: ((rows: DailyHealthRow[]) => Insight | null)[] = [
  compareSleepToMind,
  compareProteinToVolume,
  compareStepsToMind,
];

/**
 * Rows from the lookback window, up to and excluding today -- today is still being
 * written, so its protein, steps and sessions would all read low.
 */
export const selectInsightRows = (rows: DailyHealthRow[], today: Date): DailyHealthRow[] => {
  const todayKey = toDateKey(today);
  const firstKey = shiftDateKey(todayKey, -INSIGHT_LOOKBACK_DAYS);
  return rows.filter((row) => row.dateKey >= firstKey && row.dateKey < todayKey);
};

export const calculateInsights = (events: HealthEvent[], today: Date): Insight[] => {
  const rows = selectInsightRows(aggregateDailyHealth(events), today);
  const insights: Insight[] = [];
  for (const compare of COMPARISONS) {
    const insight = compare(rows);
    if (insight) insights.push(insight);
  }
  return insights;
};
