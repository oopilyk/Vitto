import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { isRemoved, liveEvents, markRemoved, restoreRemoved } from './removedEvents';
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
