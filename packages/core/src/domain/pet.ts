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
 * is what a pet keeps while nothing dominates. Only builds with evolved artwork
 * are listed — a build with no sheet behind it would promise a change that never
 * visibly arrives.
 */
export type PetBuild = 'balanced' | 'runner';

/**
 * Endurance has to be both substantial and clearly ahead of strength. Both halves
 * matter: the floor stops a level-1 pet (endurance 16, strength 14) from being
 * declared a runner on a two-point lead, and the margin stops a pet training
 * everything evenly from tipping into a specialism on noise.
 */
const RUNNER_MIN_ENDURANCE = 45;
const RUNNER_LEAD_OVER_STRENGTH = 12;

export const getPetBuild = (pet: Pick<PetState, 'endurance' | 'strength'>): PetBuild =>
  pet.endurance >= RUNNER_MIN_ENDURANCE &&
  pet.endurance - pet.strength >= RUNNER_LEAD_OVER_STRENGTH
    ? 'runner'
    : 'balanced';

export const PET_BUILD_LABEL: Record<PetBuild, string> = {
  balanced: 'Balanced',
  runner: 'Runner',
};

/**
 * Whether the pet has visibly evolved: it has both grown past `baby` and grown
 * into a specialism. Kept here rather than in the sprite layer so the copy on the
 * dashboard and the sheet the avatar draws can never disagree about it.
 */
export const hasEvolved = (pet: Pick<PetState, 'level' | 'endurance' | 'strength'>): boolean =>
  getEvolutionStage(pet.level) !== 'baby' && getPetBuild(pet) !== 'balanced';

/**
 * DEV TOOL -- which form to preview. Evolutions are earned over weeks of real
 * training, so without this the only way to see one is to wait for it.
 */
export type ForcedPetForm = 'baby' | 'teen' | 'adult' | 'runner';

/** Enough to clear each stage's threshold, and comfortably inside the next. */
const FORCED_FORM_LEVEL: Record<ForcedPetForm, number> = {
  baby: 1,
  teen: TEEN_LEVEL_THRESHOLD,
  adult: ADULT_LEVEL_THRESHOLD,
  // A runner has to be past `baby` to show its evolved sheet at all.
  runner: TEEN_LEVEL_THRESHOLD,
};

/**
 * DEV TOOL -- rewrites level and the two stats `getPetBuild` reads, so the real
 * `sheetForPet` path resolves to the requested form and nothing is special-cased.
 *
 * Moves the STATS, not the sheet, for the same reason `applyForcedAilment` does:
 * the sprite, the stage copy and the stat bars then all agree with each other.
 * The balanced forms pin endurance and strength level with each other so a pet
 * that really is a runner still previews as unevolved when asked to.
 *
 * Display only. Apply it to the projection being rendered, never to a pet on its
 * way to being saved.
 */
export const applyForcedForm = (pet: PetState, form: ForcedPetForm | null): PetState => {
  if (!form) return pet;
  const runner = form === 'runner';
  return {
    ...pet,
    level: FORCED_FORM_LEVEL[form],
    endurance: runner ? RUNNER_MIN_ENDURANCE + 20 : 20,
    strength: runner ? 10 : 20,
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
