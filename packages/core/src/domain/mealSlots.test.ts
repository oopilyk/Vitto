import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { copyableSlot, mealSlotOf, slotForTime } from './mealSlots';
import { markRemoved } from './removedEvents';

const meal = (id: string, day: number, hour: number, slot?: string): HealthEvent => ({
  id, userId: 'u', type: 'MEAL', source: 'manual', occurredAt: new Date(2026, 10, day, hour).toISOString(),
  metadata: { ...(slot ? { slot } : {}) } as never,
});

describe('meal slots', () => {
  it('reads a slot off the time, unless one was chosen', () => {
    expect(slotForTime(new Date(2026, 10, 9, 8))).toBe('breakfast');
    expect(slotForTime(new Date(2026, 10, 9, 12))).toBe('lunch');
    expect(slotForTime(new Date(2026, 10, 9, 19))).toBe('dinner');
    expect(slotForTime(new Date(2026, 10, 9, 16))).toBe('snack');
    expect(mealSlotOf(meal('a', 9, 8, 'snack'))).toBe('snack');
  });

  it("offers yesterday's slot until today has one, and never a removed meal", () => {
    const now = new Date(2026, 10, 9, 8, 30);
    const log = [meal('y1', 8, 7), meal('y2', 8, 8), markRemoved(meal('y3', 8, 9))];
    expect(copyableSlot(log, 'breakfast', now).map((event) => event.id)).toEqual(['y1', 'y2']);
    expect(copyableSlot([...log, meal('t', 9, 7)], 'breakfast', now)).toEqual([]);
  });
});
