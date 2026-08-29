import { describe, expect, it } from 'vitest';
import { calculateStreaks } from './streaks';
import type { HealthEvent } from './health';

const makeEvent = (occurredAt: string): HealthEvent => ({
  id: occurredAt,
  userId: 'user-1',
  occurredAt,
  type: 'STEP_ACTIVITY',
  source: 'manual',
  metadata: { steps: 1000 },
});

describe('calculateStreaks', () => {
  it('counts today toward the current streak when today already has activity', () => {
    const today = new Date(2026, 7, 28);
    const events = [
      makeEvent('2026-08-26T09:00:00'),
      makeEvent('2026-08-27T09:00:00'),
      makeEvent('2026-08-28T09:00:00'),
    ];

    expect(calculateStreaks(events, today).currentStreak).toBe(3);
  });

  it('keeps yesterday-based streak alive when today has no activity yet', () => {
    const today = new Date(2026, 7, 28);
    const events = [makeEvent('2026-08-26T09:00:00'), makeEvent('2026-08-27T09:00:00')];

    expect(calculateStreaks(events, today).currentStreak).toBe(2);
  });

  it('resets the current streak to zero after a missed day', () => {
    const today = new Date(2026, 7, 28);
    const events = [makeEvent('2026-08-20T09:00:00'), makeEvent('2026-08-21T09:00:00')];

    expect(calculateStreaks(events, today).currentStreak).toBe(0);
  });

  it('tracks the longest streak independently of the current one', () => {
    const today = new Date(2026, 7, 28);
    const events = [
      makeEvent('2026-08-01T09:00:00'),
      makeEvent('2026-08-02T09:00:00'),
      makeEvent('2026-08-03T09:00:00'),
      makeEvent('2026-08-04T09:00:00'),
      makeEvent('2026-08-27T09:00:00'),
      makeEvent('2026-08-28T09:00:00'),
    ];

    const summary = calculateStreaks(events, today);
    expect(summary.longestStreak).toBe(4);
    expect(summary.currentStreak).toBe(2);
  });

  it('only counts one day of credit for multiple events on the same day', () => {
    const today = new Date(2026, 7, 28);
    const events = [makeEvent('2026-08-28T09:00:00'), makeEvent('2026-08-28T18:00:00')];

    expect(calculateStreaks(events, today).currentStreak).toBe(1);
  });
});
