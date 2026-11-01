import { PET_CENTRES } from './petCentres';
import type { PetAnimation, PetSheet } from './petSprites';

/**
 * Keeping the pet in the middle of its spot. The art was not drawn centred in
 * its cells, and not even consistently off-centre: the base bear leans left to
 * idle and right to sulk, so a pet standing over its shadow in one pose stood
 * beside it in the next. Each value is where the art's middle sits, as a share
 * of the window (measured, see petCentres.ts); the pet is moved back by it.
 */
const centresOf = (sheet: Pick<PetSheet, 'name' | 'centreKey'>) => PET_CENTRES[sheet.centreKey ?? sheet.name];

/** One still frame: where its own art sits. */
export const frameCentre = (sheet: Pick<PetSheet, 'name' | 'centreKey'>, frame: readonly [number, number]): number =>
  centresOf(sheet)?.frames[`${frame[0]},${frame[1]}`] ?? 0;

/**
 * An animation's frames, as one value: their average, so the pet is centred
 * over the animation without being pulled about frame by frame -- a hop or a
 * sway drawn into the art still reads as one.
 */
export const animationCentre = (sheet: PetSheet, animation: PetAnimation): number => {
  const frames = sheet.animations[animation];
  return frames.length ? frames.reduce((total, frame) => total + frameCentre(sheet, frame), 0) / frames.length : 0;
};

/** An animation's video clip, where the form plays one; its frames otherwise. */
export const clipCentre = (sheet: PetSheet, animation: PetAnimation): number =>
  centresOf(sheet)?.clips?.[animation] ?? animationCentre(sheet, animation);

/** Points to move a window `size` across so art centred at `centre` lands in its middle. Whole points. */
export const centringShift = (centre: number, size: number): number => -Math.round(centre * size);
