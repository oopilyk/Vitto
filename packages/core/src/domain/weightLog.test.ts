import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { markRemoved } from './removedEvents';
import { plausibleWeighIn, weighIns, weightSummary } from './weightLog';

const weigh = (id: string, day: number, kg: number): HealthEvent => ({
  id, userId: 'u', type: 'BODY_WEIGHT', source: 'manual', occurredAt: new Date(2026, 9, day, 7).toISOString(), metadata: { kg } as never,
});

describe('weight log', () => {
  it('smooths weigh-ins into a trend, oldest first, without removed ones', () => {
    const entries = weighIns([weigh('b', 2, 82), weigh('a', 1, 80), markRemoved(weigh('x', 3, 120))]);
    expect(entries.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(entries[1]!.trendKg).toBe(80.5);
  });

  it('sums up the month and the way to the goal', () => {
    const entries = weighIns([weigh('a', 1, 84), weigh('b', 15, 82), weigh('c', 30, 80)]);
    const summary = weightSummary(entries, 75, new Date(2026, 9, 31, 7));
    expect(summary.latest?.kg).toBe(80);
    expect(summary.change30).toBeLessThan(0);
    expect(summary.toGoal).toBeLessThan(0);
    expect(summary.daysSince).toBe(1);
    expect(plausibleWeighIn(5)).toBe(false);
  });
});
