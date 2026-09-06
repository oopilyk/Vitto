import { describe, expect, it } from '@jest/globals';
import type { HealthEvent } from '@vitto/core';
import {
  buildScreenTimeEvent,
  findScreenTimeForDate,
  isWithinBudget,
  mapManualScreenTime,
  mapThresholdCrossing,
  mapUsageStatsTotal,
  minutesFromForegroundMillis,
} from '../services/screenTimeMapping';

// Local noon, so toDateKey (which uses local calendar fields) is unambiguous.
const NOW = new Date(2026, 8, 5, 12, 0, 0);

describe('minutesFromForegroundMillis', () => {
  it('rounds milliseconds to whole minutes', () => {
    expect(minutesFromForegroundMillis(95 * 60_000 + 29_000)).toBe(95);
    expect(minutesFromForegroundMillis(95 * 60_000 + 31_000)).toBe(96);
  });

  it('treats garbage as zero and caps at a day', () => {
    expect(minutesFromForegroundMillis(-5)).toBe(0);
    expect(minutesFromForegroundMillis(Number.NaN)).toBe(0);
    expect(minutesFromForegroundMillis(40 * 60 * 60_000)).toBe(24 * 60);
  });
});

describe('isWithinBudget', () => {
  it('is undefined without a usable budget, so the engine stays neutral', () => {
    expect(isWithinBudget(100)).toBeUndefined();
    expect(isWithinBudget(100, 0)).toBeUndefined();
    expect(isWithinBudget(100, Number.NaN)).toBeUndefined();
  });

  it('counts landing exactly on the budget as within it', () => {
    expect(isWithinBudget(120, 120)).toBe(true);
    expect(isWithinBudget(121, 120)).toBe(false);
  });
});

describe('mapManualScreenTime', () => {
  it('builds a manual SCREEN_TIME event dated today with the budget verdict', () => {
    const event = mapManualScreenTime('user-1', 95, 120, NOW);
    expect(event.type).toBe('SCREEN_TIME');
    expect(event.source).toBe('manual');
    expect(event.occurredAt).toBe(NOW.toISOString());
    expect(event.metadata).toEqual({
      minutes: 95,
      date: '2026-09-05',
      source: 'manual',
      budgetMinutes: 120,
      withinBudget: true,
    });
  });

  it('drops a meaningless budget rather than storing a zero', () => {
    const event = mapManualScreenTime('user-1', 95, 0, NOW);
    expect(event.metadata.budgetMinutes).toBeUndefined();
    expect(event.metadata.withinBudget).toBeUndefined();
  });
});

describe('mapUsageStatsTotal', () => {
  it('sums to minutes, tags the device source, and carries no per-app data', () => {
    const event = mapUsageStatsTotal('user-1', { foregroundMillis: 3 * 60 * 60_000 }, 150, NOW);
    expect(event.source).toBe('device');
    expect(event.metadata.source).toBe('usage_stats');
    expect(event.metadata.minutes).toBe(180);
    expect(event.metadata.withinBudget).toBe(false);
    // The privacy rule, asserted: only these keys, ever.
    expect(Object.keys(event.metadata).sort()).toEqual(['budgetMinutes', 'date', 'minutes', 'source', 'withinBudget']);
  });

  it('attributes the total to the day it was read for, not the moment it synced', () => {
    const yesterday = new Date(2026, 8, 4, 23, 30);
    const event = mapUsageStatsTotal('user-1', { foregroundMillis: 60_000, date: yesterday }, undefined, NOW);
    expect(event.metadata.date).toBe('2026-09-04');
    expect(event.occurredAt).toBe(NOW.toISOString());
  });
});

describe('mapThresholdCrossing', () => {
  it('records the threshold as a floor and the day as over budget', () => {
    const event = mapThresholdCrossing('user-1', { thresholdMinutes: 120 }, NOW);
    expect(event.source).toBe('device');
    expect(event.metadata).toEqual({
      minutes: 120,
      date: '2026-09-05',
      source: 'thresholds',
      budgetMinutes: 120,
      withinBudget: false,
    });
  });
});

describe('findScreenTimeForDate', () => {
  const logged = (date: string | undefined, occurredAt: string): HealthEvent => ({
    id: `s-${occurredAt}`,
    userId: 'user-1',
    occurredAt,
    type: 'SCREEN_TIME',
    source: 'manual',
    metadata: { minutes: 60, date, source: 'manual' },
  });

  it('finds the day by metadata.date even when it was typed in after midnight', () => {
    const late = logged('2026-09-05', new Date(2026, 8, 6, 0, 30).toISOString());
    expect(findScreenTimeForDate([late], NOW)?.id).toBe(late.id);
    expect(findScreenTimeForDate([late], new Date(2026, 8, 6, 12))).toBeUndefined();
  });

  it('falls back to the recorded day for events without a date, and ignores other types', () => {
    const undated = logged(undefined, new Date(2026, 8, 5, 21).toISOString());
    const sleep: HealthEvent = { ...undated, id: 'sleep', type: 'SLEEP', metadata: { asleepMinutes: 400 } };
    expect(findScreenTimeForDate([sleep, undated], NOW)?.id).toBe(undated.id);
    expect(findScreenTimeForDate([sleep], NOW)).toBeUndefined();
  });
});

describe('buildScreenTimeEvent', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY])('refuses a %s total instead of logging garbage', (minutes) => {
    expect(() => buildScreenTimeEvent('u', { minutes, source: 'manual' }, 'manual', NOW)).toThrow(/number of minutes/);
    expect(() => mapManualScreenTime('u', minutes, 120, NOW)).toThrow();
  });

  it('clamps a negative total to zero and an absurd one to a day', () => {
    expect(buildScreenTimeEvent('u', { minutes: -20, source: 'manual' }, 'manual', NOW).metadata.minutes).toBe(0);
    expect(buildScreenTimeEvent('u', { minutes: 9999, source: 'manual' }, 'manual', NOW).metadata.minutes).toBe(1440);
  });
});
