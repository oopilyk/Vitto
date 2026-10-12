import { describe, expect, it } from 'vitest';
import { formatWater, waterMlForDay, waterPeakMlForDay } from './hydration';
import type { HealthEvent } from './health';

const drink = (ml: unknown, occurredAt = '2026-08-28T12:00:00'): HealthEvent => ({
  id: String(Math.random()),
  userId: 'u',
  occurredAt,
  type: 'HYDRATION',
  source: 'manual',
  metadata: { ml },
});

describe('hydration', () => {
  it("sums the day's water, reading an entry with no amount as one glass", () => {
    const day = new Date('2026-08-28T15:00:00');
    expect(waterMlForDay([drink(500), drink(undefined), drink(300, '2026-08-27T12:00:00')], day)).toBe(750);
  });

  it('takes back cups without going below zero, and remembers the high point', () => {
    const day = new Date('2026-08-28T15:00:00');
    const events = [drink(500, '2026-08-28T09:00:00'), drink(-250, '2026-08-28T10:00:00'), drink(-1000, '2026-08-28T11:00:00')];
    expect(waterMlForDay(events, day)).toBe(0);
    expect(waterPeakMlForDay(events, day)).toBe(500);
  });

  it('formats in the user units', () => {
    expect(formatWater(750, 'metric')).toBe('750 mL');
    expect(formatWater(1250, 'metric')).toBe('1.25 L');
    expect(formatWater(1000, 'imperial')).toBe('34 fl oz');
  });
});
