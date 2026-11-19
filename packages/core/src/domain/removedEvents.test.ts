import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { careMomentCount, isRemoved, liveEvents, markRemoved, restoreRemoved } from './removedEvents';
import { mealXp } from './petHealthEngine';

const meal = (id: string, hour: number): HealthEvent => ({
  id, userId: 'u', type: 'MEAL', source: 'manual', occurredAt: new Date(2026, 10, 9, hour).toISOString(),
  metadata: { analysis: { macros: { calories: 500, proteinGrams: 30, carbsGrams: 50, fatGrams: 15 } } } as never,
});

describe('removed events', () => {
  it('hide from what is shown and come back on Undo', () => {
    const removed = markRemoved(meal('a', 8));
    expect(isRemoved(removed)).toBe(true);
    expect(liveEvents([removed, meal('b', 9)]).map((event) => event.id)).toEqual(['b']);
    expect(isRemoved(restoreRemoved(removed))).toBe(false);
  });

  it('still count toward the daily meal XP cap, so deleting and relogging cannot farm it', () => {
    const history = [8, 9, 10, 11, 12].map((hour, index) => markRemoved(meal(`m${index}`, hour)));
    expect(mealXp(meal('next', 13), history)).toBe(0);
  });
});

describe('careMomentCount', () => {
  const water = (id: string, day: number, hour: number, ml: number): HealthEvent => ({
    id, userId: 'u', type: 'HYDRATION', source: 'manual', occurredAt: new Date(2026, 10, day, hour).toISOString(),
    metadata: { ml } as never,
  });

  it("counts a day's water once however many cups it took", () => {
    const cups = [8, 10, 12, 14].map((hour, index) => water(`w${index}`, 9, hour, 250));
    expect(careMomentCount([meal('a', 8), ...cups])).toBe(2);
  });

  it('counts water once per day, and not on a day whose cups were all taken back', () => {
    const events = [water('a', 9, 8, 250), water('b', 10, 8, 250), water('c', 11, 8, 250), water('d', 11, 9, -250)];
    expect(careMomentCount(events)).toBe(2);
  });

  it('leaves weigh-ins out', () => {
    const weighIn = { ...meal('w', 7), type: 'BODY_WEIGHT' } as HealthEvent;
    expect(careMomentCount([weighIn, meal('a', 8)])).toBe(1);
  });
});
