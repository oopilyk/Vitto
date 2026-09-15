import { describe, expect, it } from 'vitest';
import { ageFactor, liftStanding, ordinal, overallStanding, RANKED_LIFTS } from './strengthStandards';

const lifter = (sex: 'male' | 'female' | 'other', age: number, weightKg: number) => ({ sex, age, weightKg });
const pct = (lift: string, kg: number, who: ReturnType<typeof lifter>) => liftStanding(lift, kg, who)?.percentile ?? null;

describe('liftStanding', () => {
  it('lands on its own bands, so the published standards are what it reports', () => {
    const male = lifter('male', 30, 80);
    // The male bench table is 0.5 / 0.75 / 1.1 / 1.5 / 1.9 times bodyweight.
    expect(pct('Bench Press', 40, male)).toBe(5);
    expect(pct('Bench Press', 60, male)).toBe(20);
    expect(pct('Bench Press', 88, male)).toBe(50);
    expect(pct('Bench Press', 120, male)).toBe(80);
    expect(pct('Bench Press', 152, male)).toBe(95);
    expect(liftStanding('Bench Press', 88, male)!.label).toBe('Intermediate');
    expect(liftStanding('Bench Press', 152, male)!.label).toBe('Elite');
  });

  it('scores women against their own table, not a discounted mens one', () => {
    const female = lifter('female', 30, 65);
    expect(pct('Bench Press', 39, female)).toBe(50);
    expect(pct('Deadlift', 78, female)).toBe(50);
    // The same absolute lift places a woman higher than a man, as the tables intend.
    expect(pct('Bench Press', 60, female)!).toBeGreaterThan(pct('Bench Press', 60, lifter('male', 30, 65))!);
  });

  it('expects less of a heavier lifter, because strength does not scale with size', () => {
    // One identical 100 kg bench, three bodyweights. A flat ratio would call the
    // 110 kg lifter far weaker than they are.
    const light = pct('Bench Press', 100, lifter('male', 30, 60))!;
    const middle = pct('Bench Press', 100, lifter('male', 30, 80))!;
    const heavy = pct('Bench Press', 100, lifter('male', 30, 110))!;
    expect(light).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(heavy);
    // But size is not destiny: the heavy lifter is still mid-pack, not bottom.
    expect(heavy).toBeGreaterThan(40);
  });

  it('credits age the way a masters meet does', () => {
    const same = (age: number) => pct('Bench Press', 100, lifter('male', age, 80))!;
    expect(same(25)).toBe(same(35));
    expect(same(55)).toBeGreaterThan(same(35));
    expect(same(70)).toBeGreaterThan(same(55));
    expect(ageFactor(30)).toBe(1);
    expect(ageFactor(50)).toBeCloseTo(1.19, 2);
    // Flat outside the table rather than extrapolating into nonsense.
    expect(ageFactor(95)).toBe(ageFactor(80));
    expect(ageFactor(5)).toBe(ageFactor(14));
  });

  it('places "other" between the two tables rather than refusing to place them', () => {
    const them = pct('Bench Press', 80, lifter('other', 30, 72))!;
    expect(them).toBeGreaterThan(pct('Bench Press', 80, lifter('male', 30, 72))!);
    expect(them).toBeLessThan(pct('Bench Press', 80, lifter('female', 30, 72))!);
  });

  it('stays inside 1 to 99 however extreme the lift', () => {
    expect(pct('Deadlift', 1, lifter('male', 30, 80))).toBeGreaterThanOrEqual(1);
    expect(pct('Deadlift', 500, lifter('male', 30, 80))).toBe(99);
  });

  it('refuses to guess rather than inventing a placing', () => {
    const male = lifter('male', 30, 80);
    // A lift with no published standard, and profiles missing what it needs.
    expect(liftStanding('Bicep Curl', 40, male)).toBeNull();
    expect(liftStanding('Squat', 100, lifter('male', 30, 0))).toBeNull();
    expect(liftStanding('Squat', 100, lifter('male', 0, 80))).toBeNull();
    expect(liftStanding('Squat', 0, male)).toBeNull();
    expect(RANKED_LIFTS).toEqual(['Bench Press', 'Squat', 'Deadlift', 'Lat Pulldown']);
  });
});

describe('overallStanding', () => {
  it('averages the lifts it could place and ignores the rest', () => {
    const male = lifter('male', 30, 80);
    const combined = overallStanding([liftStanding('Bench Press', 88, male), liftStanding('Squat', 112, male), null]);
    expect(combined!.percentile).toBe(50);
    expect(combined!.label).toBe('Intermediate');
    expect(overallStanding([null, null])).toBeNull();
  });
});

describe('ordinal', () => {
  it('spells a percentile the way it is read aloud', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 50, 62, 95, 99].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '50th', '62nd', '95th', '99th',
    ]);
  });
});
