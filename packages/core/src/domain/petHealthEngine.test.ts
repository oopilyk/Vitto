import { describe, expect, it } from 'vitest';
import { PetHealthEngine } from './petHealthEngine';
import { createPet } from './pet';
import type { HealthEvent, WorkoutStats } from './health';

const event = { id: 'event-1', userId: 'user-1', occurredAt: '2026-08-28T12:00:00Z', type: 'WORKOUT' as const, source: 'manual' as const, metadata: { workoutType: 'strength', durationMinutes: 30, intensity: 'moderate' as const } };

const statsWith = (over: Partial<WorkoutStats>): WorkoutStats => ({
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

const strengthWorkout = (id: string, occurredAt: string, stats: WorkoutStats): HealthEvent => ({
  id,
  userId: 'user-1',
  occurredAt,
  type: 'WORKOUT',
  source: 'manual',
  metadata: { workoutType: 'strength', durationMinutes: stats.durationMinutes, stats },
});

describe('PetHealthEngine', () => {
  it('turns a workout into bounded progression and a pet reaction', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, event);

    expect(result.pet.strength).toBe(pet.strength + 4);
    expect(result.pet.xp).toBe(18);
    expect(result.reaction.message).toContain('trained');
    expect(result.pet.health).toBeGreaterThanOrEqual(0);
    expect(result.pet.health).toBeLessThanOrEqual(100);
  });

  it('still works as a two-argument call, awarding volume-driven strength with no history', () => {
    const pet = createPet('user-1', 'Miso');
    const workout = strengthWorkout('w-bc', '2026-08-28T12:00:00Z', statsWith({
      volumeByMuscleGroup: { chest: 1800, back: 1200, legs: 3000 },
      totalVolume: 6000,
      muscleGroups: ['chest', 'back', 'legs'],
    }));

    const result = new PetHealthEngine().apply(pet, workout);

    expect(result.pet.pushingStrength).toBeGreaterThan(pet.pushingStrength);
    expect(result.pet.pullingStrength).toBeGreaterThan(pet.pullingStrength);
    expect(result.pet.legStrength).toBeGreaterThan(pet.legStrength);
    expect(result.pet.strength).toBeGreaterThan(pet.strength);
    expect(Number.isInteger(result.pet.strength)).toBe(true);
    expect(result.pet.pushingStrength).toBeLessThanOrEqual(100);
  });

  it('keeps the no-stats workout branch on the old flat formula', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, event, { history: [], bodyWeightKg: 80 });
    expect(result.pet.strength).toBe(pet.strength + 4);
    expect(result.pet.pushingStrength).toBe(pet.pushingStrength);
  });

  it('pays more for a workout that beats the user\'s recent training than one that matches it', () => {
    const pet = createPet('user-1', 'Miso');
    const engine = new PetHealthEngine();
    const history: HealthEvent[] = [
      strengthWorkout('h1', '2026-08-25T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000, muscleGroups: ['chest'] })),
      strengthWorkout('h2', '2026-08-23T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000, muscleGroups: ['chest'] })),
    ];
    const matching = engine.apply(pet, strengthWorkout('m', '2026-08-28T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000, muscleGroups: ['chest'] })), { history });
    const beating = engine.apply(pet, strengthWorkout('b', '2026-08-28T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 3000 }, totalVolume: 3000, muscleGroups: ['chest'] })), { history });

    expect(beating.reaction.delta.pushingStrength).toBeGreaterThan(matching.reaction.delta.pushingStrength ?? 0);
  });

  it('leaves a cardio workout on its token strength gain and leans on endurance', () => {
    const pet = createPet('user-1', 'Miso');
    const cardio: HealthEvent = {
      id: 'c1', userId: 'user-1', occurredAt: '2026-08-28T12:00:00Z', type: 'WORKOUT', source: 'manual',
      metadata: { workoutType: 'cardio', durationMinutes: 40, stats: statsWith({ bodyweightRepsByMuscleGroup: { cardio: 200 }, muscleGroups: ['cardio'] }) },
    };
    const result = new PetHealthEngine().apply(pet, cardio, { history: [] });
    expect(result.reaction.delta.strength).toBe(1);
    expect(result.reaction.delta.pushingStrength).toBe(0);
    expect(result.reaction.delta.endurance).toBeGreaterThan(0);
  });

  it('rewards a sharp mind session more than a scrappy one', () => {
    const pet = createPet('user-1', 'Miso');
    const engine = new PetHealthEngine();
    const session = (correct: number, total: number) => ({
      id: 'event-2',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'math' as const, correct, total, durationSeconds: 60, score: 80 },
    });

    const sharp = engine.apply(pet, session(9, 10));
    const scrappy = engine.apply(pet, session(3, 10));

    expect(sharp.pet.xp).toBeGreaterThan(scrappy.pet.xp);
    expect(sharp.pet.happiness).toBeGreaterThan(scrappy.pet.happiness);
    expect(sharp.reaction.eventLabel).toBe('Quick maths');
    expect(sharp.pet.mind).toBeGreaterThan(scrappy.pet.mind);
    expect(sharp.pet.mind).toBeGreaterThan(pet.mind);
    expect(sharp.pet.recovery).toBeLessThanOrEqual(100);
  });

  it('treats an wordPuzzle session as a sharp one at the accuracy bar', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, {
      id: 'event-4',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'wordPuzzle' as const, correct: 4, total: 5, durationSeconds: 240, score: 84, puzzleDate: '2026-08-28' },
    });

    expect(result.reaction.delta.recovery).toBe(4);
    expect(result.reaction.eventLabel).toBe("Daily word puzzle");
  });

  it('leaves an empty mind session harmless rather than dividing by zero', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, {
      id: 'event-3',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'reading' as const, correct: 0, total: 0, durationSeconds: 40, score: 0 },
    });

    expect(Number.isFinite(result.pet.xp)).toBe(true);
    expect(result.pet.mind).toBeGreaterThanOrEqual(pet.mind);
    expect(result.reaction.eventLabel).toBe('Read and recall');
  });
});

describe('SLEEP', () => {
  const sleepEvent = (asleepMinutes: number): HealthEvent => ({
    id: 'sleep-1',
    userId: 'user-1',
    occurredAt: '2026-09-03T06:00:00Z',
    type: 'SLEEP',
    source: 'healthkit',
    metadata: { asleepMinutes, night: '2026-09-03' },
  });

  it('restores the most energy for a full night', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20, recovery: 20 };
    const { pet: rested, reaction } = new PetHealthEngine().apply(pet, sleepEvent(8 * 60));
    expect(rested.energy).toBe(34);
    expect(rested.recovery).toBe(25);
    expect(reaction.eventLabel).toBe('Rested up');
  });

  it('gives less for a short night than a full one', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20 };
    const engine = new PetHealthEngine();
    const short = engine.apply(pet, sleepEvent(6 * 60)).pet.energy;
    const full = engine.apply(pet, sleepEvent(8 * 60)).pet.energy;
    expect(short).toBeLessThan(full);
    expect(short).toBe(29);
  });

  it('still rewards a bad night rather than punishing it', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20, happiness: 40 };
    const { pet: rested } = new PetHealthEngine().apply(pet, sleepEvent(3 * 60));
    expect(rested.energy).toBeGreaterThan(pet.energy);
    expect(rested.happiness).toBe(40);
  });

  it('reports the hours slept in the reaction message', () => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const { reaction } = new PetHealthEngine().apply(pet, sleepEvent(7 * 60 + 30));
    expect(reaction.message).toContain('7.5h');
  });

  it('treats a missing or negative duration as a bad night, not a crash', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20 };
    const { pet: rested } = new PetHealthEngine().apply(pet, sleepEvent(-10));
    expect(rested.energy).toBe(24);
  });
});
