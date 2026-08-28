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
  endurance: number;
  recovery: number;
  mood: PetMood;
  lastEventAt?: string;
}

export interface PetDelta {
  health?: number;
  energy?: number;
  happiness?: number;
  nutrition?: number;
  strength?: number;
  endurance?: number;
  recovery?: number;
  xp?: number;
}

export interface PetReaction {
  message: string;
  eventLabel: string;
  delta: PetDelta;
}

export const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.min(maximum, Math.max(minimum, value));

export const createPet = (userId: string, name: string, species: PetState['species'] = 'cat'): PetState => ({
  id: crypto.randomUUID(),
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
  endurance: 16,
  recovery: 64,
  mood: 'content',
});
