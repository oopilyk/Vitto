import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { formatPace, runRecords } from './runRecords';

const run = (id: string, distanceKm: number | undefined, durationMinutes: number, workoutType = 'cardio'): HealthEvent => ({
  id, userId: 'u', type: 'WORKOUT', source: 'manual', occurredAt: `2026-09-0${id}T07:00:00Z`,
  metadata: { workoutType, durationMinutes, ...(distanceKm !== undefined ? { distanceKm } : {}) },
});

describe('runRecords', () => {
  it('is empty until a cardio workout carries a distance', () => {
    expect(runRecords([run('1', undefined, 30), run('2', 5, 40, 'strength')], 'metric'))
      .toEqual({ unit: 'km', fastest: null, longest: null });
  });

  it('keeps the longest run and the best average pace, in the unit asked for', () => {
    // 10 km in 55 min (5:30/km) vs 5 km in 25 min (5:00/km) vs 3 km in 12 min (4:00/km).
    const events = [run('1', 10, 55), run('2', 5, 25), run('3', 3, 12)];
    const metric = runRecords(events, 'metric');
    expect(metric.longest).toMatchObject({ distance: 10, durationMinutes: 55 });
    expect(metric.fastest).toMatchObject({ distance: 3, paceMinutes: 4 });
    expect(formatPace(metric.fastest!.paceMinutes)).toBe('4:00');

    const imperial = runRecords(events, 'imperial');
    expect(imperial.unit).toBe('mi');
    expect(imperial.longest!.distance).toBeCloseTo(6.21, 2);
    // 3 km is 1.86 mi in 12 min: 6:26 per mile.
    expect(formatPace(imperial.fastest!.paceMinutes)).toBe('6:26');
  });

  it('does not let a short sprint set a pace record', () => {
    // 800 m flat out is a great split, not a mile.
    const events = [run('1', 0.8, 3), run('2', 5, 30)];
    expect(runRecords(events, 'metric').fastest).toMatchObject({ distance: 5 });
    // And below a mile the same run cannot set an imperial record either.
    expect(runRecords([run('1', 1.2, 6)], 'imperial').fastest).toBeNull();
    expect(runRecords([run('1', 1.2, 6)], 'imperial').longest).not.toBeNull();
  });

  it('formats pace as minutes and two-digit seconds', () => {
    expect(formatPace(6.7)).toBe('6:42');
    expect(formatPace(9.05)).toBe('9:03');
    expect(formatPace(10)).toBe('10:00');
  });
});
