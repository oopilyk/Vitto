import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { healthCaloriesBurnedForDay, stepsForDay } from './nutritionSummary';

const steps = (id: string, at: string, count: number, source = 'healthkit', caloriesBurned?: number): HealthEvent => ({
  id, userId: 'u', type: 'STEP_ACTIVITY', source: source as HealthEvent['source'], occurredAt: at,
  metadata: { steps: count, ...(caloriesBurned === undefined ? {} : { caloriesBurned }) },
});

describe('stepsForDay', () => {
  it("counts Apple Health's running total once, from its latest row, however many rows the day has", () => {
    const day = [
      steps('a', '2026-10-16T00:00:00', 2100, 'healthkit', 90),
      steps('b', '2026-10-16T15:30:00', 6400, 'healthkit', 260),
    ];
    // Two rows of the same running total are not 8,500 steps.
    expect(stepsForDay(day)).toBe(6400);
    expect(healthCaloriesBurnedForDay(day)).toBe(260);
  });

  it('still adds steps that did not come from Apple Health', () => {
    expect(stepsForDay([steps('a', '2026-10-16T12:00:00', 5000), steps('m', '2026-10-16T13:00:00', 1200, 'manual')])).toBe(6200);
  });
});
