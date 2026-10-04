import { describe, expect, it } from 'vitest';
import { AFFIRMATION_EVERY_DAYS, AFFIRMATION_LINES, planAffirmations } from './affirmations';

describe('planAffirmations', () => {
  const from = new Date(2026, 9, 4, 9, 0);

  it('plans the requested number, in the future, in daytime hours, every other day', () => {
    const plan = planAffirmations(from, 'pet-1', 4);
    expect(plan).toHaveLength(4);
    for (const item of plan) {
      expect(item.at.getTime()).toBeGreaterThan(from.getTime());
      expect(item.at.getHours()).toBeGreaterThanOrEqual(10);
      expect(item.at.getHours()).toBeLessThan(19);
      expect(AFFIRMATION_LINES).toContain(item.body);
    }
    const gaps = plan.slice(1).map((item, i) => Math.round((item.at.getTime() - plan[i]!.at.getTime()) / 86_400_000));
    for (const gap of gaps) expect(Math.abs(gap - AFFIRMATION_EVERY_DAYS)).toBeLessThanOrEqual(1);
  });

  it('lands on the same moments however often it is re-planned, so opening the app never postpones one', () => {
    const early = planAffirmations(from, 'pet-1', 4);
    const later = planAffirmations(new Date(2026, 9, 4, 9, 30), 'pet-1', 4);
    expect(later.map((item) => item.at.getTime())).toEqual(early.map((item) => item.at.getTime()));
    expect(later.map((item) => item.body)).toEqual(early.map((item) => item.body));
  });

  it('drops one that has already passed, and moves on to the next', () => {
    const [first] = planAffirmations(from, 'pet-1', 1);
    const [next] = planAffirmations(new Date(first!.at.getTime() + 60_000), 'pet-1', 1);
    expect(next!.at.getTime()).toBeGreaterThan(first!.at.getTime());
  });

  it('never repeats a line within a batch', () => {
    const plan = planAffirmations(from, 'pet-1', 8);
    expect(new Set(plan.map((item) => item.body)).size).toBe(plan.length);
  });

  it('gives different pets different lines on the same day', () => {
    const a = planAffirmations(from, 'pet-a', 6).map((item) => item.body);
    const b = planAffirmations(from, 'pet-b', 6).map((item) => item.body);
    expect(a).not.toEqual(b);
  });
});
