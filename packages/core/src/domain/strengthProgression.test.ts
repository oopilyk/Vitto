import { describe, expect, it } from 'vitest';
import type { HealthEvent, WorkoutStats } from './health';
import {
  axisForMuscleGroup,
  diminishingReturnsFactor,
  rollingStrengthBaseline,
  strengthGain,
  workoutAxisVolumes,
  workoutStrengthDelta,
} from './strengthProgression';

const baseStats = (over: Partial<WorkoutStats>): WorkoutStats => ({
  durationMinutes: 45,
  exerciseCount: 3,
  completedSets: 9,
  totalReps: 72,
  totalVolume: 0,
  muscleGroups: [],
  volumeByMuscleGroup: {},
  bodyweightRepsByMuscleGroup: {},
  ...over,
});

const workoutEvent = (id: string, occurredAt: string, stats: WorkoutStats): HealthEvent => ({
  id,
  userId: 'user-1',
  occurredAt,
  type: 'WORKOUT',
  source: 'manual',
  metadata: { workoutType: 'strength', durationMinutes: stats.durationMinutes, stats },
});

const pet = { strength: 20, pushingStrength: 20, pullingStrength: 20, legStrength: 20 };

describe('axisForMuscleGroup', () => {
  it('maps muscle groups to push/pull/legs and leaves the rest null', () => {
    expect(axisForMuscleGroup('Chest')).toBe('push');
    expect(axisForMuscleGroup('triceps')).toBe('push');
    expect(axisForMuscleGroup('back')).toBe('pull');
    expect(axisForMuscleGroup('biceps')).toBe('pull');
    expect(axisForMuscleGroup('legs')).toBe('legs');
    expect(axisForMuscleGroup('core')).toBeNull();
    expect(axisForMuscleGroup('cardio')).toBeNull();
  });
});

describe('workoutAxisVolumes', () => {
  it('splits loaded volume across axes and totals it', () => {
    const volumes = workoutAxisVolumes(
      baseStats({ volumeByMuscleGroup: { chest: 1000, shoulders: 500, back: 800 }, totalVolume: 2300 }),
    );
    expect(volumes.push).toBe(1500);
    expect(volumes.pull).toBe(800);
    expect(volumes.legs).toBe(0);
    expect(volumes.total).toBe(2300);
  });

  it('counts bodyweight reps toward volume, scaled by body weight when known', () => {
    const stats = baseStats({ bodyweightRepsByMuscleGroup: { chest: 40 } });
    const repsOnly = workoutAxisVolumes(stats);
    const scaled = workoutAxisVolumes(stats, 80);
    expect(repsOnly.push).toBeGreaterThan(0);
    expect(scaled.push).toBeGreaterThan(repsOnly.push);
  });

  it('falls back to totalVolume for legacy stats with no per-group breakdown', () => {
    const volumes = workoutAxisVolumes(baseStats({ totalVolume: 5000 }));
    expect(volumes.total).toBe(5000);
  });

  it('returns zeroes when there are no stats', () => {
    expect(workoutAxisVolumes(undefined)).toEqual({ push: 0, pull: 0, legs: 0, total: 0 });
  });
});

describe('rollingStrengthBaseline', () => {
  const now = new Date('2026-08-28T12:00:00Z');
  const history: HealthEvent[] = [
    workoutEvent('w1', '2026-08-26T12:00:00Z', baseStats({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000 })),
    workoutEvent('w2', '2026-08-24T12:00:00Z', baseStats({ volumeByMuscleGroup: { chest: 1200 }, totalVolume: 1200 })),
    // Outside the 14-day window — must be ignored.
    workoutEvent('old', '2026-08-01T12:00:00Z', baseStats({ volumeByMuscleGroup: { chest: 9000 }, totalVolume: 9000 })),
  ];

  it('averages recent push volume and ignores workouts outside the window', () => {
    const baseline = rollingStrengthBaseline(history, now);
    expect(baseline.sampleCount).toBe(2);
    expect(baseline.push).toBe(1100);
    expect(baseline.pull).toBe(0);
  });

  it('ignores workouts at or after the reference time', () => {
    const baseline = rollingStrengthBaseline(history, new Date('2026-08-25T00:00:00Z'));
    expect(baseline.sampleCount).toBe(1);
    expect(baseline.push).toBe(1200);
  });
});

describe('diminishingReturnsFactor', () => {
  it('shrinks as the stat approaches 100', () => {
    expect(diminishingReturnsFactor(20)).toBeGreaterThan(diminishingReturnsFactor(90));
    expect(diminishingReturnsFactor(100)).toBe(0);
  });
});

describe('strengthGain', () => {
  it('grows with training volume against a fixed baseline', () => {
    const low = strengthGain(20, 800, 1000, true);
    const match = strengthGain(20, 1000, 1000, true);
    const high = strengthGain(20, 2000, 1000, true);
    expect(high).toBeGreaterThan(match);
    expect(match).toBeGreaterThanOrEqual(low);
  });

  it('rewards beating the baseline more than matching, and matching more than falling short', () => {
    const below = strengthGain(30, 400, 1000, true);
    const matching = strengthGain(30, 1000, 1000, true);
    const beating = strengthGain(30, 1900, 1000, true);
    expect(beating).toBeGreaterThan(matching);
    expect(matching).toBeGreaterThan(below);
  });

  it('applies diminishing returns near 100', () => {
    const young = strengthGain(20, 2000, 1000, true);
    const nearMax = strengthGain(92, 2000, 1000, true);
    expect(young).toBeGreaterThan(nearMax);
    // A genuine overload still nudges a near-max stat up by at least 1.
    expect(nearMax).toBeGreaterThanOrEqual(1);
    expect(strengthGain(100, 2000, 1000, true)).toBe(0);
  });

  it('gives the modest first-workout gain when there is no baseline', () => {
    const gain = strengthGain(20, 1500, 0, false);
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThanOrEqual(4);
  });

  it('awards nothing for an axis that was not trained', () => {
    expect(strengthGain(20, 0, 1000, true)).toBe(0);
  });
});

describe('workoutStrengthDelta', () => {
  it('establishes a baseline and gives a modest gain on the first workout', () => {
    const delta = workoutStrengthDelta(pet, baseStats({ volumeByMuscleGroup: { chest: 2000 }, totalVolume: 2000 }), {
      history: [],
      occurredAt: '2026-08-28T12:00:00Z',
    });
    expect(delta.pushingStrength).toBeGreaterThan(0);
    expect(delta.pushingStrength).toBeLessThanOrEqual(4);
    expect(delta.pullingStrength).toBe(0);
    expect(delta.legStrength).toBe(0);
    expect(delta.strength).toBeGreaterThan(0);
  });

  it('pays more for a workout that beats the rolling baseline than one that matches it', () => {
    const history = [
      workoutEvent('h1', '2026-08-25T12:00:00Z', baseStats({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000 })),
      workoutEvent('h2', '2026-08-23T12:00:00Z', baseStats({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000 })),
    ];
    const matching = workoutStrengthDelta(
      pet,
      baseStats({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000 }),
      { history, occurredAt: '2026-08-28T12:00:00Z' },
    );
    const beating = workoutStrengthDelta(
      pet,
      baseStats({ volumeByMuscleGroup: { chest: 2500 }, totalVolume: 2500 }),
      { history, occurredAt: '2026-08-28T12:00:00Z' },
    );
    expect(beating.pushingStrength).toBeGreaterThan(matching.pushingStrength);
  });

  it('credits a bodyweight-only workout through reps', () => {
    const delta = workoutStrengthDelta(pet, baseStats({ bodyweightRepsByMuscleGroup: { back: 60 } }), {
      history: [],
      occurredAt: '2026-08-28T12:00:00Z',
    });
    expect(delta.pullingStrength).toBeGreaterThan(0);
    expect(delta.pushingStrength).toBe(0);
  });
});
