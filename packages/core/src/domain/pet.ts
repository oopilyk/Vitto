import { newId } from './ids';

export type PetMood = 'bright' | 'content' | 'sleepy' | 'hungry';

/** Which drawn companion the pet is. Optional: pets adopted before the picker have none. */
export type PetBreed = 'bichon' | 'shiba' | 'orangeCat' | 'otter';

export const PET_BREEDS: PetBreed[] = ['bichon', 'shiba', 'orangeCat', 'otter'];

export interface PetState {
  id: string;
  /**
   * Who adopted the pet — the creator, not the sole carer. A care partner can
   * hold and save this same pet; membership lives in `pet_members`, not here.
   */
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
  /**
   * Row version from the database, bumped by a trigger on every update. Used
   * for optimistic writes (`savePetIfUnchanged`) so two carers cannot overwrite
   * each other. Optional: local pets, `createPet` and the web never carry one.
   */
  version?: number;
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

/**
 * The level a pet has to reach before a specialism can show as an evolution.
 *
 * There used to be a baby/teen/adult ladder that gated this and also drove the
 * sprite's size. It was removed: the builds are the progression the pet actually
 * has, and a second, parallel one measured only in levels said nothing the level
 * number was not already saying. What is left is the part that mattered — a pet
 * has to have been raised a while before how it was raised means anything, so a
 * level-2 pet that has been walked twice is not yet a runner.
 */
export const EVOLUTION_LEVEL = 11;

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
 * Whether the pet has visibly evolved: it has both reached `EVOLUTION_LEVEL` and
 * grown into a specialism. Kept here rather than in the sprite layer so the copy
 * on the dashboard and the sheet the avatar draws can never disagree about it.
 */
export const hasEvolved = (
  pet: Pick<PetState, 'level' | 'endurance' | 'strength' | 'mind'>,
): boolean => pet.level >= EVOLUTION_LEVEL && getPetBuild(pet) !== 'balanced';

/**
 * DEV TOOL -- which form to preview. Evolutions are earned over weeks of real
 * training, so without this the only way to see one is to wait for it.
 */
export type ForcedPetForm = 'base' | 'runner' | 'lifter' | 'scholar';

/** `base` stays under the line on purpose; a specialism has to clear it. */
const FORCED_FORM_LEVEL: Record<ForcedPetForm, number> = {
  base: 1,
  runner: EVOLUTION_LEVEL,
  lifter: EVOLUTION_LEVEL,
  scholar: EVOLUTION_LEVEL,
};

/**
 * What the stats a forced form is not pushing up get held at.
 *
 * Must stay clear of every ailment threshold in `petCondition.ts` — it used to be
 * 10, which is exactly the `foggy` line, so forcing Runner or Lifter dropped
 * `mind` onto it and the preview came back dizzy no matter what the forced status
 * said. Still far enough below the dominant stat (65) to clear
 * `BUILD_LEAD_OVER_OTHERS` several times over, so the build still reads correctly.
 * `petStats.test.ts` asserts a forced form produces no ailments at all.
 */
const FORCED_FORM_FLOOR = 20;

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
 * the sprite, the build copy and the stat bars then all agree with each other.
 * A specialism gets its stat well past the floor with the other two held low;
 * `base` pins all three level with each other so a pet that really is a runner,
 * lifter or scholar still previews as unevolved when asked to.
 *
 * Display only. Apply it to the projection being rendered, never to a pet on its
 * way to being saved.
 */
export const applyForcedForm = (pet: PetState, form: ForcedPetForm | null): PetState => {
  if (!form) return pet;
  const dominant = FORCED_FORM_STAT[form];
  const statFor = (stat: 'endurance' | 'strength' | 'mind'): number => {
    if (!dominant) return FORCED_FORM_FLOOR;
    return stat === dominant ? BUILD_MIN_STAT + 20 : FORCED_FORM_FLOOR;
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
