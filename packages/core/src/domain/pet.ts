import { newId } from './ids';

export type PetMood = 'bright' | 'content' | 'sleepy' | 'hungry';

/** Which drawn companion the pet is. Optional: pets adopted before the picker have none. */
export type PetBreed = 'bichon' | 'shiba' | 'orangeCat' | 'otter';

export const PET_BREEDS: PetBreed[] = ['bichon', 'shiba', 'orangeCat', 'otter'];

export interface PetState {
  id: string;
  userId: string;
  name: string;
  species: 'cat' | 'dog' | 'bunny';
  breed?: PetBreed;
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

/**
 * The shape a pet has grown into. Derived from how it was actually raised, never
 * chosen: the point is that the pet reflects the user's own habits back at them.
 *
 * `balanced` is the absence of a specialism rather than a build of its own, and
 * is what a pet keeps while nothing dominates. Every specialism listed here has
 * evolved artwork for all four breeds — a build with no sheet behind it would
 * promise a change that never visibly arrives, so add the art before the build.
 */
export type PetBuild = 'balanced' | 'runner' | 'lifter' | 'scholar';

/**
 * A specialism's stat has to be both substantial and clearly ahead of the other
 * two. Both halves matter: the floor stops a level-1 pet (endurance 16, strength
 * 14) from being declared a runner on a two-point lead, and the margin stops a pet
 * training everything evenly from tipping into a specialism on noise. Because the
 * lead is required over BOTH rivals, at most one specialism can ever qualify.
 */
const BUILD_MIN_STAT = 45;
const BUILD_LEAD_OVER_OTHERS = 12;

const dominates = (stat: number, ...others: number[]): boolean =>
  stat >= BUILD_MIN_STAT && others.every((other) => stat - other >= BUILD_LEAD_OVER_OTHERS);

export const getPetBuild = (pet: Pick<PetState, 'endurance' | 'strength' | 'mind'>): PetBuild => {
  const { endurance, strength, mind } = pet;
  if (dominates(endurance, strength, mind)) return 'runner';
  if (dominates(strength, endurance, mind)) return 'lifter';
  if (dominates(mind, endurance, strength)) return 'scholar';
  return 'balanced';
};

export const PET_BUILD_LABEL: Record<PetBuild, string> = {
  balanced: 'Balanced',
  runner: 'Runner',
  lifter: 'Lifter',
  scholar: 'Scholar',
};

/**
 * Whether the pet has visibly evolved: it has both grown past `baby` and grown
 * into a specialism. Kept here rather than in the sprite layer so the copy on the
 * dashboard and the sheet the avatar draws can never disagree about it.
 */
export const hasEvolved = (
  pet: Pick<PetState, 'level' | 'endurance' | 'strength' | 'mind'>,
): boolean => getEvolutionStage(pet.level) !== 'baby' && getPetBuild(pet) !== 'balanced';

/**
 * DEV TOOL -- which form to preview. Evolutions are earned over weeks of real
 * training, so without this the only way to see one is to wait for it.
 */
export type ForcedPetForm = 'baby' | 'teen' | 'adult' | 'runner' | 'lifter' | 'scholar';

/** Enough to clear each stage's threshold, and comfortably inside the next. */
const FORCED_FORM_LEVEL: Record<ForcedPetForm, number> = {
  baby: 1,
  teen: TEEN_LEVEL_THRESHOLD,
  adult: ADULT_LEVEL_THRESHOLD,
  // A specialism has to be past `baby` to show its evolved sheet at all.
  runner: TEEN_LEVEL_THRESHOLD,
  lifter: TEEN_LEVEL_THRESHOLD,
  scholar: TEEN_LEVEL_THRESHOLD,
};

/** Which of the three stats `getPetBuild` reads a forced specialism pushes up. */
const FORCED_FORM_STAT: Partial<Record<ForcedPetForm, 'endurance' | 'strength' | 'mind'>> = {
  runner: 'endurance',
  lifter: 'strength',
  scholar: 'mind',
};

/**
 * DEV TOOL -- rewrites level and the three stats `getPetBuild` reads, so the real
 * `sheetForPet` path resolves to the requested form and nothing is special-cased.
 *
 * Moves the STATS, not the sheet, for the same reason `applyForcedAilment` does:
 * the sprite, the stage copy and the stat bars then all agree with each other.
 * A specialism gets its stat well past the floor with the other two held low; the
 * balanced forms pin all three level with each other so a pet that really is a
 * runner, lifter or scholar still previews as unevolved when asked to.
 *
 * Display only. Apply it to the projection being rendered, never to a pet on its
 * way to being saved.
 */
export const applyForcedForm = (pet: PetState, form: ForcedPetForm | null): PetState => {
  if (!form) return pet;
  const dominant = FORCED_FORM_STAT[form];
  const statFor = (stat: 'endurance' | 'strength' | 'mind'): number => {
    if (!dominant) return 20;
    return stat === dominant ? BUILD_MIN_STAT + 20 : 10;
  };
  return {
    ...pet,
    level: FORCED_FORM_LEVEL[form],
    endurance: statFor('endurance'),
    strength: statFor('strength'),
    mind: statFor('mind'),
  };
};

export const createPet = (
  userId: string,
  name: string,
  species: PetState['species'] = 'cat',
  breed: PetBreed = 'bichon',
  id: string = newId(),
): PetState => ({
  id,
  breed,
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
