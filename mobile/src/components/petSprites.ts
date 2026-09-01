import type { ImageSourcePropType } from 'react-native';
import type { PetBreed, PetState } from '@vitto/core';

/**
 * Both sheets are a 4-column grid of 128px cells. Rows come in bands, and the
 * frame lists below were read off the sheets rather than assumed — the two sheets
 * do not have the same number of frames per band.
 */
export const CELL = 128;
export const SHEET_COLUMNS = 4;
export const SHEET_ROWS = 11;

export type PetAnimation = 'idle' | 'cheer' | 'move' | 'rest';

/** [row, column] pairs, in playback order. */
type Frame = readonly [number, number];

export interface PetSheet {
  name: PetBreed;
  label: string;
  source: ImageSourcePropType;
  animations: Record<PetAnimation, readonly Frame[]>;
}

export const PET_SHEETS: PetSheet[] = [
  {
    name: 'bichon',
    label: 'Bichon',
    source: require('../../assets/pet/bichon.png'),
    animations: {
      idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1]],
      cheer: [[2, 0], [2, 1], [2, 2], [2, 3], [3, 0], [3, 1], [3, 2]],
      move: [[4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 1]],
      rest: [[9, 0], [9, 1], [9, 2], [9, 3], [10, 0], [10, 1], [10, 2], [10, 3]],
    },
  },
  {
    name: 'shiba',
    label: 'Shiba',
    source: require('../../assets/pet/shiba.png'),
    animations: {
      idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1]],
      cheer: [[2, 0], [2, 1], [2, 2], [2, 3], [3, 0], [3, 1]],
      move: [[4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 1], [5, 2], [5, 3]],
      rest: [[9, 0], [9, 1], [9, 2], [9, 3], [10, 0], [10, 1]],
    },
  },
];

export const sheetByBreed = (breed: PetBreed): PetSheet =>
  PET_SHEETS.find((sheet) => sheet.name === breed) ?? PET_SHEETS[0];

/**
 * The chosen breed wins. Pets adopted before the picker existed have none, so they
 * fall back to a stable hash of their id rather than all becoming the same dog.
 */
export const sheetForPet = (pet: Pick<PetState, 'id' | 'breed'>): PetSheet => {
  if (pet.breed) return sheetByBreed(pet.breed);
  let hash = 0;
  for (let index = 0; index < pet.id.length; index += 1) {
    hash = (hash * 31 + pet.id.charCodeAt(index)) >>> 0;
  }
  return PET_SHEETS[hash % PET_SHEETS.length];
};

/** Frames per second, per animation — resting breathes, running scampers. */
export const FRAME_MS: Record<PetAnimation, number> = {
  idle: 180,
  cheer: 110,
  move: 90,
  rest: 260,
};
