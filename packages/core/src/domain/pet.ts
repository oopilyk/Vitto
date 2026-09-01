import { newId } from './ids';

export type PetMood = 'bright' | 'content' | 'sleepy' | 'hungry';

export interface PetState {
  id: string;
  userId: string;
  name: string;
  species: 'cat' | 'dog' | 'bunny';
  level: number;
  xp: number;
  health: number;
  energy: number;
  happiness: number;
  nutrition: number;
  strength: number;
  pushingStrength: number;
  pullingStrength: number;
  legStrength: number;
  endurance: number;
  recovery: number;
  mind: number;
  mood: PetMood;
  adoptedAt: string;
  lastEventAt?: string;
}

export interface PetDelta {
  health?: number;
  energy?: number;
  happiness?: number;
  nutrition?: number;
  strength?: number;
  pushingStrength?: number;
  pullingStrength?: number;
  legStrength?: number;
  endurance?: number;
  recovery?: number;
  mind?: number;
  xp?: number;
}

export interface PetReaction {
  message: string;
  eventLabel: string;
  delta: PetDelta;
}

// Pet stats are whole numbers everywhere they are stored (integer columns) and shown,
// while time decay works in fractional days, so clamping rounds as well as bounds.
export const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.round(Math.min(maximum, Math.max(minimum, value)));

export type EvolutionStage = 'baby' | 'teen' | 'adult';

const TEEN_LEVEL_THRESHOLD = 11;
const ADULT_LEVEL_THRESHOLD = 31;

export const getEvolutionStage = (level: number): EvolutionStage => {
  if (level >= ADULT_LEVEL_THRESHOLD) return 'adult';
  if (level >= TEEN_LEVEL_THRESHOLD) return 'teen';
  return 'baby';
};

export const EVOLUTION_STAGE_LABEL: Record<EvolutionStage, string> = {
  baby: 'Baby',
  teen: 'Teen',
  adult: 'Adult',
};

export const createPet = (
  userId: string,
  name: string,
  species: PetState['species'] = 'cat',
  id: string = newId(),
): PetState => ({
  id,
  userId,
  name,
  species,
  level: 1,
  xp: 0,
  health: 78,
  energy: 72,
  happiness: 82,
  nutrition: 68,
  strength: 14,
  pushingStrength: 10,
  pullingStrength: 10,
  legStrength: 10,
  endurance: 16,
  recovery: 64,
  mind: 20,
  mood: 'content',
  adoptedAt: new Date().toISOString(),
});
