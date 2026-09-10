import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { PROFILE_SURVEY_DEFAULTS, calculateMacroTargets, type BodyProfile } from './macroTargets';
import {
  STEP_TROPHY_DAILY_STEPS,
  TROPHY_DAYS,
  WORKOUT_TROPHY_WEEKS,
  earnedTrophies,
  trophyRule,
} from './trophies';

const profile: BodyProfile = {
  ...PROFILE_SURVEY_DEFAULTS,
  age: 30,
  sex: 'male',
  heightCm: 175,
  heightUnit: 'cm',
  weightKg: 70,
  weightUnit: 'kg',
  activity: 'moderate',
  goal: 'maintain',
  trainingDaysPerWeek: 3,
} as BodyProfile;

const TODAY = new Date(2026, 8, 10, 12); // 10 Sep 2026, local noon

const daysAgo = (n: number, hour = 9): string => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

let seq = 0;
const event = (type: HealthEvent['type'], occurredAt: string, metadata: unknown): HealthEvent =>
  ({ id: `e-${(seq += 1)}`, userId: 'u', occurredAt, type, source: 'manual', metadata }) as HealthEvent;

const workout = (n: number) => event('WORKOUT', daysAgo(n), { workoutType: 'run', durationMinutes: 30 });
const steps = (n: number, count: number) => event('STEP_ACTIVITY', daysAgo(n, 21), { steps: count });
const onTargetMeal = (n: number) => {
  const t = calculateMacroTargets(profile);
  return event('MEAL', daysAgo(n, 13), {
    protein: true, vegetables: true, fruit: false, wholeGrains: false, fiber: false, treats: false,
    analysis: { grade: 'A', summary: '', confidence: 1, detectedFoods: [], nutrients: {},
      macros: { calories: t.calories, proteinGrams: t.proteinGrams, carbsGrams: t.carbsGrams, fatGrams: t.fatGrams } },
  });
};

describe('earnedTrophies', () => {
  it('starts with an empty shelf', () => {
    expect(earnedTrophies([], profile, TODAY)).toEqual([]);
  });

  describe('dumbbell — a month of hitting your weekly workout target', () => {
    it('is earned by four straight weeks at the profile target', () => {
      // 3 a week for 4 weeks: days 1,3,6 of each 7-day block, counting back from
      // today. The last one lands 27 days ago, so the history spans the full 28
      // days a four-week window needs.
      const events = [0, 1, 2, 3].flatMap((week) => [1, 3, 6].map((d) => workout(week * 7 + d)));
      expect(earnedTrophies(events, profile, TODAY)).toContain('dumbbell');
    });

    it('is not earned when one of the four weeks falls short', () => {
      const events = [0, 1, 3].flatMap((week) => [1, 3, 6].map((d) => workout(week * 7 + d)));
      events.push(workout(2 * 7 + 1), workout(2 * 7 + 3)); // week 2: only two
      expect(earnedTrophies(events, profile, TODAY)).not.toContain('dumbbell');
    });

    it('uses the target the user set — a lower target is easier', () => {
      const once = { ...profile, trainingDaysPerWeek: 1 };
      // One a week, the last 27 days ago so the four weeks are all in history.
      const events = [0, 1, 2, 3].map((week) => workout(week * 7 + 6));
      expect(earnedTrophies(events, once, TODAY)).toContain('dumbbell');
      expect(earnedTrophies(events, profile, TODAY)).not.toContain('dumbbell');
    });

    it('never hands it out for doing nothing, even with a zero target', () => {
      const none = { ...profile, trainingDaysPerWeek: 0 };
      expect(earnedTrophies([], none, TODAY)).not.toContain('dumbbell');
    });

    it('counts a qualifying month from earlier in the history, so it is never lost', () => {
      // Qualified 60-88 days ago, then stopped entirely.
      const events = [0, 1, 2, 3].flatMap((week) => [1, 3, 6].map((d) => workout(60 + week * 7 + d)));
      expect(earnedTrophies(events, profile, TODAY)).toContain('dumbbell');
    });
  });

  describe('shoe — 10k steps a day for a month', () => {
    it('is earned by thirty consecutive days at or above the bar', () => {
      const events = Array.from({ length: TROPHY_DAYS }, (_, n) => steps(n, STEP_TROPHY_DAILY_STEPS));
      expect(earnedTrophies(events, profile, TODAY)).toContain('shoe');
    });

    it('is broken by a single day under the bar', () => {
      const events = Array.from({ length: TROPHY_DAYS }, (_, n) =>
        steps(n, n === 12 ? STEP_TROPHY_DAILY_STEPS - 1 : STEP_TROPHY_DAILY_STEPS),
      );
      expect(earnedTrophies(events, profile, TODAY)).not.toContain('shoe');
    });

    it('is broken by a day with no step sync at all', () => {
      const events = Array.from({ length: TROPHY_DAYS }, (_, n) => steps(n, 12_000)).filter(
        (_, n) => n !== 7,
      );
      expect(earnedTrophies(events, profile, TODAY)).not.toContain('shoe');
    });

    it('reads two syncs on one day as one reading, not two walks', () => {
      // 6k + 6k synced the same day must not be counted as 12k.
      const events = Array.from({ length: TROPHY_DAYS }, (_, n) => steps(n, 12_000));
      events[3] = steps(3, 6_000);
      events.push(steps(3, 6_000));
      expect(earnedTrophies(events, profile, TODAY)).not.toContain('shoe');
    });
  });

  describe('drumstick — hitting calorie and protein goals for a month', () => {
    it('is earned by thirty days on target', () => {
      const events = Array.from({ length: TROPHY_DAYS }, (_, n) => onTargetMeal(n));
      expect(earnedTrophies(events, profile, TODAY)).toContain('drumstick');
    });

    it('is not earned when a day misses the calorie band', () => {
      const events = Array.from({ length: TROPHY_DAYS }, (_, n) => onTargetMeal(n));
      const t = calculateMacroTargets(profile);
      events[5] = event('MEAL', daysAgo(5, 13), {
        protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false,
        analysis: { grade: 'C', summary: '', confidence: 1, detectedFoods: [], nutrients: {},
          macros: { calories: t.calories * 0.6, proteinGrams: t.proteinGrams, carbsGrams: 0, fatGrams: 0 } },
      });
      expect(earnedTrophies(events, profile, TODAY)).not.toContain('drumstick');
    });

    it('is not earned on days with nothing eaten, whatever the target', () => {
      const events = Array.from({ length: TROPHY_DAYS }, (_, n) => onTargetMeal(n)).filter((_, n) => n !== 20);
      expect(earnedTrophies(events, profile, TODAY)).not.toContain('drumstick');
    });
  });

  it('returns trophies in shelf order regardless of which was earned first', () => {
    const events = [
      ...Array.from({ length: TROPHY_DAYS }, (_, n) => steps(n, 12_000)),
      ...[0, 1, 2, 3].flatMap((week) => [1, 3, 6].map((d) => workout(week * 7 + d))),
    ];
    expect(earnedTrophies(events, profile, TODAY)).toEqual(['dumbbell', 'shoe']);
  });
});

describe('trophyRule', () => {
  it('states the workout rule in the user\'s own weekly number', () => {
    expect(trophyRule('dumbbell', { trainingDaysPerWeek: 3 })).toBe(`${WORKOUT_TROPHY_WEEKS} weeks in a row of 3 workouts a week`);
    expect(trophyRule('dumbbell', { trainingDaysPerWeek: 1 })).toContain('1 workout a week');
  });
});
