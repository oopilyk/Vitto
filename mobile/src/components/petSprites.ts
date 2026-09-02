import type { ImageSourcePropType } from 'react-native';
import type { PetBreed, PetState } from '@vitto/core';

/**
 * Both sheets are a 4-column grid of 128px cells. Rows come in bands, and the
 * frame lists below were read off the sheets rather than assumed — the two sheets
 * do not have the same number of frames per band.
 *
 * The bands, verified cell by cell against the artwork:
 *
 *   rows 0–1   idle standing        bichon 6 frames   shiba 6 frames
 *   rows 2–3   cheer / jump         bichon 7          shiba 6
 *   rows 4–5   run                  bichon 6          shiba 8
 *   rows 6–8   bichon: queasy → dizzy (10)   shiba: content sitting (9)
 *   rows 9–10  bichon: sad → wobble → collapse → dead (8)
 *              shiba:  sad sitting → fade out (6)
 *
 * The two sheets genuinely diverge in the last two bands: the shiba has no dizzy
 * art and no lying-collapse art, and the bichon has no sitting art. Neither sheet
 * has a true sleep pose — that is an art gap, not a mapping mistake, so `rest`
 * borrows the calmest frame each sheet happens to own.
 */
export const CELL = 128;
export const SHEET_COLUMNS = 4;
export const SHEET_ROWS = 11;

export type PetAnimation = 'idle' | 'cheer' | 'move' | 'rest' | 'unwell' | 'sad' | 'faint';

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
      // The one frame on this sheet that reads as peaceful out of context: lying
      // flat, face down, eyes closed. It is the third beat of the collapse, but
      // alone it is a dog having a lie-down. Single frame on purpose — PetAvatar
      // skips the frame timer under two frames and its bob keeps the pet alive.
      rest: [[9, 2]],
      // Queasy (blush, wavy mouth) shading into fully dizzy (swirl/X eyes).
      unwell: [
        [6, 0], [6, 1], [6, 2], [6, 3],
        [7, 0], [7, 1], [7, 2], [7, 3],
        [8, 0], [8, 1],
      ],
      // Just the standing-sad beats; the collapse belongs to `faint`.
      sad: [[9, 0], [9, 1]],
      // Wobble → collapse → down for good. Row 10 is four frames of lying still.
      faint: [[9, 1], [9, 2], [9, 3], [10, 0], [10, 1], [10, 2], [10, 3]],
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
      // The tail of the content-sitting band: a calm, closed-mouth sit.
      rest: [[8, 0]],
      // This sheet has no dizzy art at all, so the sad sit stands in and the
      // DizzyOrbit overlay carries the "unwell" reading instead of the sprite.
      unwell: [[9, 0], [9, 1], [9, 2], [9, 3]],
      sad: [[9, 0], [9, 1], [9, 2], [9, 3]],
      // No collapse art either — this sheet fades out instead of falling over.
      // [10, 1] is the same sit at roughly half alpha, so it must be the last frame.
      faint: [[9, 0], [9, 3], [10, 0], [10, 1]],
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

/**
 * Animations that play once and stay on their final cell instead of looping back
 * to the first. A pet that has fainted must stay down; looping would stand it up
 * again every couple of seconds.
 */
export const HOLDS_LAST_FRAME: ReadonlySet<PetAnimation> = new Set<PetAnimation>(['faint']);

/** Frames per second, per animation — resting breathes, running scampers. */
export const FRAME_MS: Record<PetAnimation, number> = {
  idle: 180,
  cheer: 110,
  move: 90,
  rest: 260,
  unwell: 200,
  sad: 300,
  faint: 420,
};
