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
});
