import { describe, expect, it } from 'vitest';
import { PetHealthEngine } from './petHealthEngine';
import { createPet } from './pet';

const event = { id: 'event-1', userId: 'user-1', occurredAt: '2026-08-28T12:00:00Z', type: 'WORKOUT' as const, source: 'manual' as const, metadata: { workoutType: 'strength', durationMinutes: 30, intensity: 'moderate' as const } };

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
