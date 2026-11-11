import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { STRENGTH_TIERS, liftHistory, liftScores, mappedExerciseNames, muscleRanks, tierThresholdsKg } from './strengthRanks';
import { exerciseLibrary } from './workout';
import { estimatedOneRepMax } from './oneRepMax';

const LB = 0.45359237;
const workout = (sets: { name: string; weight: number; reps: number; unit?: 'kg' | 'lb'; completed?: boolean }[]): HealthEvent =>
  ({
    id: Math.random().toString(36),
    type: 'WORKOUT',
    occurredAt: '2026-09-30T12:00:00Z',
    metadata: {
      workoutType: 'strength',
      durationMinutes: 60,
      exercises: sets.map((set, index) => ({
        id: `e${index}`,
        name: set.name,
        muscleGroup: 'x',
        sets: [{ id: `s${index}`, reps: set.reps, weight: set.weight, unit: set.unit ?? 'lb', completed: set.completed ?? true }],
      })),
    },
  }) as unknown as HealthEvent;

const man180 = { sex: 'male' as const, weightKg: 180 * LB };
const tierName = (tier: number | null) => (tier === null ? 'Unranked' : STRENGTH_TIERS[tier]);
const score = (events: HealthEvent[], lift: string, profile: { sex: 'male' | 'female' | 'other'; weightKg: number } = man180) => liftScores(events, profile).find((s) => s.lift === lift)!;

describe('strength ranks', () => {
  it('estimates a one-rep max from a set', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(116.7, 1);
    // Very high-rep sets are capped, not trusted.
    expect(estimatedOneRepMax(100, 30)).toBeCloseTo(estimatedOneRepMax(100, 10), 5);
  });

  it('puts a 315 bench at 180 lb in Grand Champion, and a 135 bench in Gold', () => {
    expect(tierName(score([workout([{ name: 'Bench Press', weight: 315, reps: 1 }])], 'bench').tier)).toBe('Grand Champion');
    expect(tierName(score([workout([{ name: 'Bench Press', weight: 135, reps: 5 }])], 'bench').tier)).toBe('Silver');
    expect(tierName(score([workout([{ name: 'Bench Press', weight: 185, reps: 1 }])], 'bench').tier)).toBe('Gold');
  });

  it('holds women to their own standards', () => {
    const woman140 = { sex: 'female' as const, weightKg: 140 * LB };
    // 155 lb is ~1.1x bodyweight: Gold for a man of that weight, Champion for a woman.
    const events = [workout([{ name: 'Bench Press', weight: 155, reps: 1 }])];
    expect(tierName(score(events, 'bench', { ...woman140, sex: 'male' }).tier)).toBe('Gold');
    expect(tierName(score(events, 'bench', woman140).tier)).toBe('Champion');
  });

  it('counts variations as the barbell lift, and ignores unticked sets', () => {
    // One 100 lb dumbbell is about a 240 lb barbell bench.
    expect(score([workout([{ name: 'Dumbbell Bench Press', weight: 100, reps: 1 }])], 'bench').oneRepMaxKg).toBeCloseTo(240 * LB, 0);
    expect(score([workout([{ name: 'Bench Press', weight: 405, reps: 1, completed: false }])], 'bench').oneRepMaxKg).toBeNull();
  });

  it('tells you what the next rank takes', () => {
    const bench = score([workout([{ name: 'Bench Press', weight: 185, reps: 1 }])], 'bench');
    expect(bench.nextTierKg).toBeCloseTo(1.25 * 180 * LB, 0);
  });

  it('grades a muscle by the average of its lifts, and leaves untrained ones unranked', () => {
    const events = [workout([
      { name: 'Squat', weight: 450, reps: 1 }, // 2.5x: Grand Champion
      { name: 'Deadlift', weight: 225, reps: 1 }, // 1.25x: Silver
    ])];
    const ranks = muscleRanks(liftScores(events, man180));
    expect(tierName(ranks.quads)).toBe('Grand Champion');
    expect(tierName(ranks.hamstrings)).toBe('Silver');
    // Glutes average Grand Champion (6) and Silver (1): 3.5, rounded down.
    expect(tierName(ranks.glutes)).toBe('Platinum');
    expect(ranks.chest).toBeNull();
  });
});

describe('lift history', () => {
  const at = (iso: string, event: HealthEvent) => ({ ...event, occurredAt: iso }) as HealthEvent;

  it('gives one point per workout, its best set, oldest first, from the lift itself only', () => {
    const events = [
      at('2026-09-20T12:00:00Z', workout([{ name: 'Bench Press', weight: 185, reps: 5 }])),
      at('2026-09-10T12:00:00Z', workout([
        { name: 'Bench Press', weight: 155, reps: 5 },
        { name: 'Bench Press', weight: 165, reps: 3 },
      ])),
      // Not a bench: ignored.
      at('2026-09-15T12:00:00Z', workout([{ name: 'Squat', weight: 225, reps: 5 }])),
      // A variation is its own line, not a point on the bench's.
      at('2026-09-25T12:00:00Z', workout([{ name: 'Incline Dumbbell Press', weight: 70, reps: 8 }])),
    ];
    const points = liftHistory(events, 'bench');
    expect(points.map((p) => p.occurredAt.slice(0, 10))).toEqual(['2026-09-10', '2026-09-20']);
    // 165x3 (~181.5 lb) edges out 155x5 (~180.8 lb).
    expect(points[0]!.from).toMatchObject({ weight: 165, reps: 3 });
    expect(points[1]!.oneRepMaxKg).toBeCloseTo(estimatedOneRepMax(185 * LB, 5), 0);
  });

  it('agrees with liftScores on the best when only the lift itself is logged', () => {
    const events = [workout([{ name: 'Squat', weight: 225, reps: 5 }]), workout([{ name: 'Squat', weight: 205, reps: 8 }])];
    const best = Math.max(...liftHistory(events, 'squat').map((p) => p.oneRepMaxKg));
    expect(best).toBeCloseTo(score(events, 'squat').oneRepMaxKg!, 0);
  });

  it('gives the tier thresholds in kg at this bodyweight', () => {
    const thresholds = tierThresholdsKg('bench', man180);
    expect(thresholds).toHaveLength(STRENGTH_TIERS.length);
    expect(thresholds[STRENGTH_TIERS.length - 1]).toBeCloseTo(1.75 * 180 * LB, 0);
  });
});

describe('exercise names', () => {
  it('every exercise the ranks and the muscle map name is one the picker offers (a typo would never count)', () => {
    const library = new Set(exerciseLibrary.map(([name]) => name as string));
    expect(mappedExerciseNames().filter((name) => !library.has(name))).toEqual([]);
  });
});
