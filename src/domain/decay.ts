import { determineMood } from './petHealthEngine';
import { clamp, type PetState } from './pet';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const ENERGY_DECAY_PER_DAY = 4;
const NUTRITION_DECAY_PER_DAY = 6;
const HAPPINESS_DECAY_PER_DAY = 3;

/**
 * Projects a pet's needs-based stats forward from its last care event to `asOf`.
 * Pure and safe to call repeatedly: it never mutates `lastEventAt`, so it must
 * never be persisted as-is — only a real care event (via PetHealthEngine) should
 * be saved, anchoring the next decay calculation from that new point in time.
 */
export const applyTimeDecay = (pet: PetState, asOf: Date): PetState => {
  const anchor = new Date(pet.lastEventAt ?? pet.adoptedAt);
  const elapsedDays = Math.max(0, (asOf.getTime() - anchor.getTime()) / ONE_DAY_MS);
  if (elapsedDays <= 0) return pet;

  const energy = clamp(pet.energy - elapsedDays * ENERGY_DECAY_PER_DAY);
  const nutrition = clamp(pet.nutrition - elapsedDays * NUTRITION_DECAY_PER_DAY);
  const happiness = clamp(pet.happiness - elapsedDays * HAPPINESS_DECAY_PER_DAY);

  return {
    ...pet,
    energy,
    nutrition,
    happiness,
    mood: determineMood(energy, nutrition, happiness),
  };
};
