import { describe, expect, it } from 'vitest';
import type {
  BrainTrainingMetadata,
  HealthEvent,
  HealthEventType,
  MealMetadata,
  SleepMetadata,
  StepMetadata,
  WorkoutMetadata,
} from './health';
import {
  ACTIVE_STEPS,
  INSIGHT_LOOKBACK_DAYS,
  MIN_DAYS_PER_GROUP,
  MIN_PAIRED_DAYS,
  MIN_RELATIVE_EFFECT,
  SHORT_SLEEP_MINUTES,
  aggregateDailyHealth,
  calculateInsights,
  compareProteinToVolume,
  compareSleepToMind,
} from './insights';
import { toDateKey } from './streaks';

// ---------------------------------------------------------------------------
// Event factory. Every date is in August 2026 and `today` is 5 September, so the
// whole month sits inside the lookback window and strictly before today.
// ---------------------------------------------------------------------------

const today = new Date(2026, 8, 5);

/** `day(14)` -> '2026-08-14'. */
const day = (dayOfMonth: number): string => toDateKey(new Date(2026, 7, dayOfMonth));

let nextId = 0;

const makeEvent = <T>(type: HealthEventType, occurredAt: string, metadata: T): HealthEvent<T> => ({
  id: `event-${(nextId += 1)}`,
  userId: 'user-1',
  occurredAt,
  type,
  source: 'manual',
  metadata,
});

const sleep = (dateKey: string, asleepMinutes: number): HealthEvent<SleepMetadata> =>
  makeEvent('SLEEP', `${dateKey}T07:00:00`, { asleepMinutes, night: dateKey });

const mind = (
  dateKey: string,
  correct: number,
  total: number,
  over: Partial<BrainTrainingMetadata> = {},
): HealthEvent<BrainTrainingMetadata> =>
  makeEvent('BRAIN_TRAINING', `${dateKey}T12:00:00`, {
    game: 'math',
    correct,
    total,
    durationSeconds: 60,
    score: 50,
    ...over,
  });

const stepsOn = (dateKey: string, steps: number): HealthEvent<StepMetadata> =>
  makeEvent('STEP_ACTIVITY', `${dateKey}T20:00:00`, { steps });

const workout = (dateKey: string, totalVolume: number): HealthEvent<WorkoutMetadata> =>
  makeEvent('WORKOUT', `${dateKey}T18:00:00`, {
    workoutType: 'strength',
    durationMinutes: 45,
    stats: {
      durationMinutes: 45,
      exerciseCount: 3,
      completedSets: 9,
      totalReps: 72,
      totalVolume,
      muscleGroups: ['chest'],
    },
  });

const meal = (dateKey: string, proteinGrams: number, flags: Partial<MealMetadata> = {}): HealthEvent<MealMetadata> =>
  makeEvent('MEAL', `${dateKey}T13:00:00`, {
    protein: proteinGrams > 0,
    vegetables: false,
    fruit: false,
    wholeGrains: false,
    fiber: false,
    treats: false,
    analysis: {
      grade: 'B',
      summary: 'A plate.',
      confidence: 0.9,
      detectedFoods: [],
      macros: { calories: 0, proteinGrams, carbsGrams: 40, fatGrams: 10 },
      nutrients: { protein: proteinGrams > 0, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false },
    },
    ...flags,
  });

const SHORT_NIGHT = SHORT_SLEEP_MINUTES - 60;
const FULL_NIGHT = SHORT_SLEEP_MINUTES + 120;

/**
 * `shortDays` short nights and `fullDays` full nights, each followed by a 20-question
 * session at the given accuracy. Days are laid out consecutively from the 1st.
 */
const sleepMindScenario = (
  shortDays: number,
  shortAccuracy: number,
  fullDays: number,
  fullAccuracy: number,
): HealthEvent[] => {
  const events: HealthEvent[] = [];
  for (let index = 0; index < shortDays + fullDays; index += 1) {
    const key = day(index + 1);
    const isShort = index < shortDays;
    events.push(sleep(key, isShort ? SHORT_NIGHT : FULL_NIGHT));
    events.push(mind(key, Math.round((isShort ? shortAccuracy : fullAccuracy) * 20), 20));
  }
  return events;
};

const shuffle = <T>(items: T[]): T[] => {
  // Fixed permutation, not Math.random: the test itself has to be deterministic.
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = (index * 7 + 3) % (index + 1);
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
};

describe('aggregateDailyHealth', () => {
  it('leaves a field absent on a day with no measurement and writes 0 on a day that measured zero', () => {
    const rows = aggregateDailyHealth([
      workout(day(1), 0),
      sleep(day(2), 400),
    ]);

    const restDay = rows.find((row) => row.dateKey === day(2));
    const emptyLift = rows.find((row) => row.dateKey === day(1));
    expect(emptyLift?.workoutVolume).toBe(0);
    expect(restDay).toBeDefined();
    expect(restDay).not.toHaveProperty('workoutVolume');
    expect(emptyLift).not.toHaveProperty('asleepMinutes');
    expect(rows.find((row) => row.dateKey === day(3))).toBeUndefined();
  });

  it('weights a day with several brain sessions by question count, not by session', () => {
    const [row] = aggregateDailyHealth([mind(day(4), 1, 1), mind(day(4), 5, 20)]);

    // A naive mean of 100% and 25% would be 62.5%; 6 of 21 is 28.6%.
    expect(row.mindQuestions).toBe(21);
    expect(row.mindAccuracy).toBeCloseTo(6 / 21, 6);
  });

  it('attributes sleep to the morning it ended and a word puzzle to its puzzle date', () => {
    const rows = aggregateDailyHealth([
      makeEvent<SleepMetadata>('SLEEP', `${day(10)}T23:30:00`, { asleepMinutes: 420, night: day(11) }),
      // Finished after midnight, but the board was set for the 11th.
      makeEvent<BrainTrainingMetadata>('BRAIN_TRAINING', `${day(12)}T00:30:00`, {
        game: 'wordPuzzle',
        correct: 3,
        total: 5,
        durationSeconds: 300,
        score: 60,
        puzzleDate: day(11),
      }),
      // A timed game has no puzzle date and stays with its completion time.
      makeEvent<BrainTrainingMetadata>('BRAIN_TRAINING', `${day(12)}T00:45:00`, {
        game: 'math',
        correct: 10,
        total: 10,
        durationSeconds: 60,
        score: 90,
      }),
    ]);

    expect(rows.map((row) => row.dateKey)).toEqual([day(11), day(12)]);
    expect(rows[0]).toMatchObject({ asleepMinutes: 420, mindAccuracy: 0.6, mindQuestions: 5 });
    expect(rows[1]).toMatchObject({ mindAccuracy: 1, mindQuestions: 10 });
    expect(rows[1]).not.toHaveProperty('asleepMinutes');
  });

  it('takes the highest step total of the day rather than adding syncs together', () => {
    const [row] = aggregateDailyHealth([stepsOn(day(5), 3000), stepsOn(day(5), 7200)]);
    expect(row.steps).toBe(7200);
  });

  it('sums meal macros and counts meal signals', () => {
    const [row] = aggregateDailyHealth([
      meal(day(6), 30, { vegetables: true }),
      meal(day(6), 25, { vegetables: true, treats: true }),
    ]);

    expect(row.macros?.proteinGrams).toBe(55);
    expect(row.mealSignals).toEqual({ protein: 2, vegetables: 2, fruit: 0, wholeGrains: 0, fiber: 0, treats: 1 });
  });
});

describe('calculateInsights', () => {
  // The scenarios below are written in literals on purpose: built from the constants
  // they would keep passing if a threshold were quietly loosened.
  it('pins the honesty thresholds', () => {
    expect(MIN_DAYS_PER_GROUP).toBe(5);
    expect(MIN_PAIRED_DAYS).toBe(12);
    expect(MIN_RELATIVE_EFFECT).toBe(0.1);
  });

  it('returns nothing when either group is below the per-group minimum', () => {
    // 4 short nights is one short of a group, however many full nights there are.
    const events = sleepMindScenario(4, 0.5, 20, 0.9);
    expect(calculateInsights(events, today)).toEqual([]);
  });

  it('returns nothing when the paired days fall short of the overall minimum', () => {
    // Both groups clear 5, but 6 + 5 = 11 paired days is one short overall.
    const events = sleepMindScenario(6, 0.5, 5, 0.9);
    expect(calculateInsights(events, today)).toEqual([]);
  });

  it('speaks up at exactly the minimums', () => {
    // 5 + 7 = 12 paired days, smallest group 5, 30% gap.
    const insights = calculateInsights(sleepMindScenario(5, 0.7, 7, 1), today);
    expect(insights).toHaveLength(1);
    expect(insights[0].sampleDays).toBe(12);
    expect(insights[0].under.days).toBe(5);
    expect(insights[0].effectSize).toBeCloseTo(-0.3, 3);
  });

  it('returns nothing when the effect is real but tiny', () => {
    // 0.80 vs 0.85 is a 6% relative gap, under the 10% floor.
    const events = sleepMindScenario(6, 0.8, 6, 0.85);
    expect(calculateInsights(events, today)).toEqual([]);
  });

  it('gates on the exact relative gap, not the rounded one', () => {
    // Short nights 2000/2000, full nights 1819/2000: a 9.95% gap, which rounds to 10%
    // at three decimals but is still under the floor.
    const events: HealthEvent[] = [];
    for (let index = 1; index <= 12; index += 1) {
      const isShort = index <= 6;
      events.push(sleep(day(index), isShort ? SHORT_NIGHT : FULL_NIGHT));
      events.push(mind(day(index), isShort ? 2000 : 1819, 2000));
    }
    expect(calculateInsights(events, today)).toEqual([]);

    // One more question wrong on the full nights and the gap clears the floor.
    const over = events.map((event) =>
      event.type === 'BRAIN_TRAINING' && (event.metadata as BrainTrainingMetadata).correct === 1819
        ? { ...event, metadata: { ...(event.metadata as BrainTrainingMetadata), correct: 1818 } }
        : event,
    );
    const [insight] = calculateInsights(over, today);
    expect(insight.direction).toBe('higher');
    expect(insight.effectSize).toBeCloseTo(0.1, 3);
  });

  it('finds a planted sleep signal and reports direction, effect size and sample size', () => {
    const events = sleepMindScenario(6, 0.6, 8, 0.8);
    const insights = calculateInsights(events, today);

    expect(insights).toHaveLength(1);
    const [insight] = insights;
    expect(insight.kind).toBe('sleep-mind');
    expect(insight.direction).toBe('lower');
    expect(insight.effectSize).toBeCloseTo(-0.25, 3);
    expect(insight.sampleDays).toBe(14);
    expect(insight.under).toEqual({ days: 6, mean: 0.6 });
    expect(insight.over).toEqual({ days: 8, mean: 0.8 });
    expect(insight.detail).toContain('less than 6 hours of sleep');
    expect(insight.detail).toContain('25% lower');
    expect(insight.detail).toContain('14 days');
    expect(`${insight.headline} ${insight.detail}`).not.toMatch(/significant|p\s*[<=]|causes?|hurts?/i);
  });

  it('reports the higher direction when the short-sleep group scores better', () => {
    const [insight] = calculateInsights(sleepMindScenario(6, 0.9, 6, 0.6), today);
    expect(insight.direction).toBe('higher');
    expect(insight.effectSize).toBeCloseTo(0.5, 3);
    expect(insight.detail).toContain('50% higher');
  });

  it('finds a same-day steps signal', () => {
    const events: HealthEvent[] = [];
    for (let index = 1; index <= 12; index += 1) {
      const active = index > 6;
      events.push(stepsOn(day(index), active ? ACTIVE_STEPS : ACTIVE_STEPS - 1));
      events.push(mind(day(index), active ? 18 : 12, 20));
    }

    const [insight] = calculateInsights(events, today);
    expect(insight.kind).toBe('steps-mind');
    expect(insight.direction).toBe('lower');
    expect(insight.detail).toContain('8,000 steps');
    expect(insight.sampleDays).toBe(12);
  });

  it('leaves out days with no next-day workout instead of counting them as zero volume', () => {
    const events: HealthEvent[] = [];
    // Six lighter-protein days, each followed by a 1000 volume session.
    for (let index = 1; index <= 6; index += 1) {
      events.push(meal(day(index * 3), 80), workout(day(index * 3 + 1), 1000));
    }
    // Six higher-protein days followed by a 1200 session ...
    for (let index = 7; index <= 12; index += 1) {
      events.push(meal(day(index * 2 + 5), 160), workout(day(index * 2 + 6), 1200));
    }
    // ... and one more higher-protein day followed by nothing at all. Treated as a
    // zero it would drag the higher-protein mean below the lighter one.
    events.push(meal(day(31), 160));

    const rows = aggregateDailyHealth(events);
    const insight = compareProteinToVolume(rows);
    expect(insight).not.toBeNull();
    expect(insight?.sampleDays).toBe(12);
    expect(insight?.direction).toBe('lower');
    expect(insight?.under).toEqual({ days: 6, mean: 1000 });
    expect(insight?.over).toEqual({ days: 6, mean: 1200 });
    expect(insight?.effectSize).toBeCloseTo((1000 - 1200) / 1200, 3);
    // The median of six 80g and six 160g days is 120g.
    expect(insight?.detail).toContain('under about 120g of protein');
  });

  it('counts a logged workout with zero volume as a zero in the comparison', () => {
    const events: HealthEvent[] = [];
    for (let index = 1; index <= 6; index += 1) {
      events.push(meal(day(index * 2), 80), workout(day(index * 2 + 1), 1000));
    }
    for (let index = 7; index <= 12; index += 1) {
      // Every higher-protein day is followed by a session that moved no weight.
      events.push(meal(day(index * 2), 160), workout(day(index * 2 + 1), 0));
    }

    const insight = compareProteinToVolume(aggregateDailyHealth(events));
    // Baseline (higher-protein) mean is 0, so there is no relative figure to report.
    expect(insight).toBeNull();
  });

  it('is deterministic across repeated calls and reorderings of the input', () => {
    const events = [
      ...sleepMindScenario(6, 0.6, 8, 0.8),
      ...Array.from({ length: 14 }, (_, index) => stepsOn(day(index + 1), index < 6 ? 2000 : 12000)),
    ];

    const first = calculateInsights(events, today);
    const second = calculateInsights(events, today);
    const reordered = calculateInsights(shuffle(events), today);

    expect(first).toHaveLength(2);
    expect(first.map((insight) => insight.kind)).toEqual(['sleep-mind', 'steps-mind']);
    expect(second).toEqual(first);
    expect(reordered).toEqual(first);
    expect(calculateInsights([...events].reverse(), today)).toEqual(first);
  });

  it('ignores data outside the lookback window and today itself', () => {
    const old = new Date(2026, 8, 5);
    old.setDate(old.getDate() - INSIGHT_LOOKBACK_DAYS - 20);
    const staleEvents = sleepMindScenario(6, 0.6, 8, 0.8).map((event) => {
      const shifted = new Date(event.occurredAt);
      shifted.setDate(shifted.getDate() - INSIGHT_LOOKBACK_DAYS - 40);
      const key = toDateKey(shifted);
      const metadata =
        event.type === 'SLEEP' ? { ...(event.metadata as SleepMetadata), night: key } : event.metadata;
      return { ...event, occurredAt: `${key}T${event.occurredAt.slice(11)}`, metadata };
    });
    expect(calculateInsights(staleEvents, today)).toEqual([]);

    // The same signal inside the window, plus a contradicting day stamped today, which
    // must not be read while today is still being written.
    const todayKey = toDateKey(today);
    const live = [...sleepMindScenario(6, 0.6, 8, 0.8), sleep(todayKey, SHORT_NIGHT), mind(todayKey, 20, 20)];
    const [insight] = calculateInsights(live, today);
    expect(insight.sampleDays).toBe(14);
    expect(compareSleepToMind(aggregateDailyHealth(live))?.sampleDays).toBe(15);
  });
});
