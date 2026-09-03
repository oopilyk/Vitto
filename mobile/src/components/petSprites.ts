import type { ImageSourcePropType } from 'react-native';
import { getEvolutionStage, getPetBuild, type PetAilment, type PetBreed, type PetBuild, type PetState } from '@vitto/core';

/**
 * Every sheet is a 4-column grid of 128px cells. Rows come in bands, and the
 * frame lists below were read off the sheets rather than assumed — the sheets do
 * not agree on how many frames a band has, or even which bands they own.
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
 * The two dog sheets genuinely diverge in the last two bands: the shiba has no
 * dizzy art and no lying-collapse art, and the bichon has no sitting art. Neither
 * has a true sleep pose — an art gap, not a mapping mistake, so their `rest`
 * borrows the calmest frame each one happens to own.
 *
 * The orangeCat sheet uses all 11 rows and is the best supplied of the three: it
 * is the only one with real sleep art (lying, then curled) AND real dizzy art
 * (spiral eyes, orbiting stars), so its `rest` and `unwell` are the poses they
 * claim to be rather than the stand-ins the dogs settle for.
 *
 * Its cells are 189px, not 128. That is fine and needs no rescaling: `SpriteFrame`
 * derives everything from `size / CELL`, so the constant cancels and only the 4x11
 * grid shape matters. Keeping the art at native resolution means the sheet is
 * downscaled slightly to the stage instead of being upscaled from 128.
 *
 *   orangeCat rows 0  standing idle (4)       6  crying → collapsed, X eyes (4)
 *                  1  sitting (4, unused)     7  dizzy, spiral eyes (4)
 *                  2  crouch → pounce (4,     8  lying → curled asleep (4)
 *                     unused)                 9  sitting, tearful (4)
 *                  3  leap / play (4)        10  [10,0] is a synthesised blink
 *                                                  frame (see `idle`); the rest
 *                                                  of the row is unused
 *                  4  walk (4)
 *                  5  run (4)
 */
export const CELL = 128;
export const SHEET_COLUMNS = 4;
export const SHEET_ROWS = 11;

/**
 * Where the artwork starts inside a cell, as a fraction of the cell height.
 *
 * Measured off both sheets rather than guessed: the topmost opaque row across
 * every non-empty cell is row 18 of 128 on each of them (the cheer/jump band,
 * where the dog is at full stretch). Poses sit lower — the bichon's idle starts
 * at 27, the shiba's at 38 — so anchoring on the tallest pose means an effect
 * placed here clears the pet in every frame it can be shown with, instead of
 * only in the pose it happened to be tuned against.
 */
export const SPRITE_ART_TOP = 18 / CELL;

export type PetAnimation = 'idle' | 'cheer' | 'move' | 'rest' | 'unwell' | 'sad' | 'faint';

/** [row, column] pairs, in playback order. */
type Frame = readonly [number, number];

export interface PetSheet {
  name: PetBreed;
  label: string;
  source: ImageSourcePropType;
  animations: Record<PetAnimation, readonly Frame[]>;
  /**
   * Ailments this sheet's own art already depicts, so PetAvatar can drop the
   * matching particle overlay.
   *
   * The overlays exist to cover for missing art — the shiba has no dizzy band, so
   * DizzyOrbit has to carry `foggy` on its behalf. A sheet that draws the thing
   * itself gets both at once instead: the cat's dizzy frames have their own
   * spiral eyes and orbiting stars, and DizzyOrbit put a second, unrelated set of
   * stars on top of them.
   */
  selfDrawn?: readonly PetAilment[];
  /**
   * Per-animation frame timings that replace `FRAME_MS` for this sheet only.
   *
   * The shared table is tuned to the dogs, whose bands have many more frames: the
   * bichon spends 10 frames getting queasy where the cat has 3, so the same
   * interval that paces the dog makes the cat's shorter loop feel hurried. Only
   * the keys given are overridden.
   */
  frameMs?: Partial<Record<PetAnimation, number>>;
  /**
   * Evolved forms of this companion, keyed by the build that earns them. Held on
   * the base sheet rather than listed alongside it so the breed picker keeps
   * offering exactly the forms a pet can be adopted as — an evolution is grown
   * into, never chosen.
   */
  evolutions?: Partial<Record<PetBuild, PetSheet>>;
}

/**
 * The runner's evolved sheet. Same eleven-band layout as the base cat, so the
 * frame mapping carries over unchanged; the art differs (leaner build, scarf,
 * socks) and its cells are 256px rather than 189px. Cell size is free — see the
 * note on the orangeCat sheet — and 256 keeps the art filling the same ~89% of
 * its cell as the base sheet, so evolving does not also jump the pet's scale.
 */
const ORANGE_CAT_RUNNER: PetSheet = {
  name: 'orangeCat',
  label: 'Orange Cat · Runner',
  source: require('../../assets/pet/orangeCatRunner.png'),
  animations: {
    // Eyes open, eyes closed, nothing else moving. [2, 0] — a pounce frame,
    // redundant with the leap band `cheer` already uses — holds frame [0, 0]'s
    // body carrying frame [0, 3]'s closed eyes, patched over just the eye sockets
    // plus 2px so none of the fur that shifted between those frames comes with it.
    // Weighted seven-to-one rather than a straight alternation: at 200ms that is
    // ~1.4s still, then a 200ms blink. An even two-frame loop blinks five times a
    // second.
    idle: [
      [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
      [0, 3], [0, 3]
    ],
    cheer: [[3, 0], [3, 1], [3, 2], [3, 3]],
    move: [[5, 0], [5, 1], [5, 2], [5, 3]],
    // Row 6, the flat-out band, rather than the curled sleep on row 8: `rest` is
    // what an exhausted pet plays, and this reads as a cat with nothing left
    // rather than one that has settled down for the night. [6, 0] and [6, 3] are
    // the closest pair on the row — 12.5% of the silhouette apart, where every
    // other pairing is 23-36% — so the loop is a breath, not a reposition.
    rest: [[6, 0], [6, 3]],
    // [7, 2] and [7, 3], not the first two: on this sheet the dizzy band opens
    // with two frames whose eyes are still normal — only these two have the
    // spiral eyes that make the state read as dizzy. (The base cat is the other
    // way round: its first three are spiral-eyed and its fourth is the collapse.)
    unwell: [[7, 2], [7,1]],
    sad: [[9, 0], [9, 1], [9, 2], [9, 3]],
    // Moved to row 10 now that row 6 is `rest`. It is the better collapse anyway:
    // upset, stumbling, down, then out cold with X eyes — which is the frame
    // HOLDS_LAST_FRAME parks on. Row 6 only ever showed a tired lie-down, so
    // dying and exhausted would otherwise have looked identical.
    faint: [[10, 0], [10, 1], [10, 2], [10, 3]],
  },
  selfDrawn: ['foggy'],
  frameMs: { idle: 200, unwell: 340 },
};

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
  {
    name: 'orangeCat',
    label: 'Orange Cat',
    source: require('../../assets/pet/orangeCat.png'),
    animations: {
      // A blink, and nothing else. The drawn idle band could not do this: every
      // cell in it is a different stance, 8-11% of the silhouette apart, with the
      // body leaning several pixels left and right — cycling it read as fidgeting.
      //
      // So [10, 0] is frame [0, 0]'s body with frame [0, 3]'s closed eyes patched
      // over it. Those two frames draw the head in exactly the same place (both
      // span x 23-169, y 21-89) and their eyes sit at the same x, so the swap is
      // seamless. Weighted: seven open cells to one closed, which at 200ms is
      // ~1.4s of stillness and a 200ms blink.
      idle: [
        [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
        [10, 0],
      ],
      // A leap with an open-mouthed grin — the liveliest band on the sheet.
      cheer: [[3, 0], [3, 1], [3, 2], [3, 3]],
      // The run band only. Playing walk and run as one cycle made the cat change
      // gait twice a second, which read as a glitch rather than as movement. The
      // walk band (row 4) is the calmer swap if this ever wants toning down.
      move: [[5, 0], [5, 1], [5, 2], [5, 3]],
      // One frame: the tightest curl. `rest` is what an exhausted pet plays, and
      // a pet with nothing left should be still — the bob is all the movement it
      // needs. [8, 2] is the looser curl if a two-frame breath is ever wanted.
      rest: [[8, 3]],
      // Two frames. This sheet has real dizzy art, so unlike the shiba it does not
      // borrow the sad band or lean on the DizzyOrbit overlay to read as unwell.
      // [7, 2] and [7, 3] are left out: [7, 3] is the lying-down beat, which made
      // a dizzy pet look like it kept collapsing and getting back up, and a
      // two-frame sway is enough to read as dizzy without the third.
      unwell: [[7, 0], [7, 1]],
      sad: [[9, 0], [9, 1], [9, 2], [9, 3]],
      // Upset, going down, out cold. Ends on the X-eyed frame, which is where
      // HOLDS_LAST_FRAME parks it.
      faint: [[6, 0], [6, 1], [6, 2], [6, 3]],
    },
    // The dizzy band draws its own spiral eyes and orbiting stars.
    selfDrawn: ['foggy'],
    evolutions: { runner: ORANGE_CAT_RUNNER },
    // Slower than the shared table: these bands are 3-4 frames where the dogs'
    // are 6-10, so the default interval raced through them. `idle` is fast because
    // it is a blink cycle, not a pose cycle — see the note on that band.
    frameMs: { idle: 200, unwell: 340 },
  },
];

export const sheetByBreed = (breed: PetBreed): PetSheet =>
  PET_SHEETS.find((sheet) => sheet.name === breed) ?? PET_SHEETS[0];

/**
 * The chosen breed wins. Pets adopted before the picker existed have none, so they
 * fall back to a stable hash of their id rather than all becoming the same dog.
 */
/**
 * The sheet a pet is drawn from, evolutions included.
 *
 * `level`, `endurance` and `strength` are optional so the still previews in the
 * breed picker can ask for a breed's base look without inventing a pet: a partial
 * pet has no level, reads as `baby`, and so never resolves to an evolved form.
 */
export const sheetForPet = (
  pet: Pick<PetState, 'id' | 'breed'> & Partial<Pick<PetState, 'level' | 'endurance' | 'strength'>>,
): PetSheet => {
  const base = baseSheetForPet(pet);
  // Gated on the stage as well as the build: a level-2 pet that has been walked a
  // lot is still a baby, and growing up is what the evolution is meant to mark.
  if (getEvolutionStage(pet.level ?? 1) === 'baby') return base;
  const build = getPetBuild({ endurance: pet.endurance ?? 0, strength: pet.strength ?? 0 });
  return base.evolutions?.[build] ?? base;
};

const baseSheetForPet = (pet: Pick<PetState, 'id' | 'breed'>): PetSheet => {
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
  // Unused in practice: every sheet now holds a single `rest` frame, and
  // PetAvatar skips the timer below two frames. Kept slow so that a sheet which
  // one day has a real sleeping loop breathes rather than fidgets.
  rest: 700,
  unwell: 200,
  sad: 300,
  faint: 420,
};
