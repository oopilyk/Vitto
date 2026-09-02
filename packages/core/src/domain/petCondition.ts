import { type PetState } from './pet';

/**
 * What is visibly wrong with a pet right now. Ailments are derived from stats on
 * every render -- nothing here is stored. In particular this is NOT a `PetMood`:
 * `pets.mood` carries a CHECK constraint, and a value outside it fails the whole
 * pet save rather than being dropped as an unknown column.
 */
export type PetAilment = 'dying' | 'starving' | 'exhausted' | 'sad' | 'foggy';

export const AILMENT_THRESHOLDS = {
  dying: 15, // health    <=
  starving: 20, // nutrition <=
  exhausted: 20, // energy    <=
  sad: 25, // happiness <=
  foggy: 10, // mind      <=
} as const;

/** Worst first. The sprite shows exactly one; overlays show at most two. */
export const AILMENT_PRECEDENCE = ['dying', 'starving', 'exhausted', 'sad', 'foggy'] as const;

/** Which stat each ailment reads. Keeps the threshold table and the check in one place. */
const AILMENT_STAT: Record<PetAilment, keyof Pick<PetState, 'health' | 'nutrition' | 'energy' | 'happiness' | 'mind'>> = {
  dying: 'health',
  starving: 'nutrition',
  exhausted: 'energy',
  sad: 'happiness',
  foggy: 'mind',
};

/** Three particle systems at once is noise, not information. */
const MAX_OVERLAYS = 2;

export interface PetCondition {
  /** Every ailment currently present, worst first. */
  ailments: PetAilment[];
  /** Drives the sprite band and the headline copy. The sprite is a single body pose. */
  primary: PetAilment | null;
  /** At most two; `dying` suppresses all others. */
  overlays: PetAilment[];
  /** 0 = perfect, 1 = flatlined. Mind is excluded: it is a look, not a vital. */
  severity: number;
}

export const AILMENT_MESSAGE: Record<PetAilment, (name: string) => string> = {
  dying: (name) => `${name} is fading. Care for them now.`,
  starving: (name) => `${name} is starving. Log a meal.`,
  exhausted: (name) => `${name} is running on empty. Get some rest.`,
  sad: (name) => `${name} is lonely and low. Spend some time together.`,
  foggy: (name) => `${name}'s mind is foggy. Try the Mind Gym.`,
};

/** Comfortably clear of every threshold, and above THRIVING_NEED. */
const FORCED_CLEAR_VALUE = 70;

/**
 * DEV TOOL -- rewrites the stats behind the ailment table so the real
 * `assessCondition` path lands on `status` and nothing else. `null` is a no-op,
 * so this is safe to leave in the render path for every user; 'healthy' forces
 * the opposite of an ailment, which is the only way to preview a well pet once
 * decay has already run it into the ground.
 *
 * It moves the STATS, not the condition: mood, the stat bars and the headline
 * copy then all agree with each other, which a short-circuit in
 * `assessCondition` could not manage. Every other ailment stat is lifted clear
 * so a higher-precedence ailment cannot steal the sprite -- a neglected pet is
 * usually `dying` too, which would otherwise outrank whatever was asked for.
 *
 * Display only. Apply it to the projection being rendered, never to a pet on
 * its way to being saved.
 */
export type ForcedPetStatus = PetAilment | 'healthy';

export const applyForcedAilment = (pet: PetState, status: ForcedPetStatus | null): PetState => {
  if (!status) return pet;
  const forced = { ...pet };
  for (const candidate of AILMENT_PRECEDENCE) {
    // 'healthy' matches no ailment, so every stat lands on the clear value --
    // which is the whole definition of a well pet, not a special case.
    forced[AILMENT_STAT[candidate]] =
      candidate === status ? AILMENT_THRESHOLDS[candidate] : FORCED_CLEAR_VALUE;
  }
  return forced;
};

export const assessCondition = (pet: PetState): PetCondition => {
  const ailments = AILMENT_PRECEDENCE.filter(
    (ailment) => pet[AILMENT_STAT[ailment]] <= AILMENT_THRESHOLDS[ailment],
  );

  const primary = ailments[0] ?? null;
  // A dying pet must never render as merely sad, and nothing should compete with
  // that read -- so `dying` takes the sprite and clears the overlay slots.
  const overlays = primary === 'dying' ? [] : ailments.slice(1, 1 + MAX_OVERLAYS);

  const severity =
    1 - Math.min(pet.health, pet.nutrition, pet.energy, pet.happiness) / 100;

  return { ailments: [...ailments], primary, overlays: [...overlays], severity };
};
