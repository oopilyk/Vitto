import type { ImageSourcePropType } from 'react-native';
import { EVOLUTION_LEVEL, getPetBuild, type PetAilment, type PetBreed, type PetBuild, type PetState } from '@vitto/core';

/**
 * The dogs and cat are 4-column grids of square cells; the otter is a 6x10 grid
 * and carries its own `columns`/`rows`. Rows come in bands, and the frame lists
 * below were read off the sheets rather than assumed — the sheets do not agree on
 * how many frames a band has, or even which bands they own.
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
 * The seven sheets below the otter come from one asset pack and share a shape:
 * 4 columns of 128px cells, a row count that varies per animal (7 to 10), and
 * bands that run across rows and pad the last row with empty cells. Every one of
 * them was verified to sit square on its grid, so unlike the shiba runner none
 * needed re-laying.
 *
 * What they do NOT share is which bands exist. The pack gives each animal a
 * different set, and the gaps are real art gaps rather than mapping mistakes:
 *
 *   bunny, fox      a true sleep band (lying, eyes closed) and NO collapse
 *   tabbyCat, dino  a collapse ending in X eyes and NO sleep
 *   koala           neither a walk nor a run band -- it only ever sits
 *   bear            a fade-to-nothing collapse, like the shiba's
 *   axolotl         its own distressed band, so `unwell` is a real pose
 *
 * Where a sheet has no art for a state, its `rest`/`unwell`/`sad` borrow the
 * calmest or saddest sitting frames it does own -- the same compromise the two
 * dogs already make -- and DizzyOrbit keeps carrying `foggy` for all of them.
 *
 * None was drawn with evolved art, so each one's lifter and scholar are derived
 * from its base sheet by `mobile/scripts/buildEvolutionSprites.mjs`, the same way
 * the dogs' and the otter's are. None has a runner: that build stays on the base
 * sheet, which is the documented fallback in `sheetForPet`, not an oversight.
 *
 * Cell size is free: `SpriteFrame` derives everything from `size / CELL`, so the
 * constant cancels and only the grid shape matters.
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
  /**
   * Grid shape of this sheet, when it is not the 4x11 the dogs and cat use. Only
   * the shape matters — `SpriteFrame` derives every pixel from `size`, so the
   * cell's actual resolution cancels out (see the note at the top of this file).
   * The otter is a 6x10 sheet and the pack sheets set their own row counts;
   * everything else omits these and takes the default.
   */
  columns?: number;
  rows?: number;
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

// ---------------------------------------------------------------------------
// Derived forms
//
// The runner sheets were drawn by hand and carry hand-read frame maps of their
// own. The lifter and scholar sheets are not drawn: `scripts/buildEvolutionSprites.mjs`
// derives them from the base art, cell by cell, so they share the base grid and
// the base frame map exactly, and re-running that script regenerates all eight.
//
//   lifter   strength build — red headband, chest broadened, palette a touch
//            warmer; the floor line is kept so the pet does not grow taller.
//   scholar  mind build — navy mortarboard with a gold tassel, palette cooled
//            a little toward blue.
//
// Lying, curled and collapsed frames deliberately get no accessory — the script
// only hangs one on a cell it can find an upright head in, so a fainted lifter
// is not wearing a headband on its tail.
//
// To keep that sharing from turning into duplication, each breed's frame table
// and shared per-sheet settings live in one `*_LAYOUT`, and `sheetFrom` stamps a
// sheet out of it. Every sheet still owns its own `animations` object (a copy,
// not the shared table), so a form can be given a different map later without
// its siblings noticing, and nothing downstream can tell a copy from a hand map.
// ---------------------------------------------------------------------------

/** What a base sheet and the forms derived from it have in common. */
type SheetLayout = Omit<PetSheet, 'source' | 'label' | 'evolutions'>;

const sheetFrom = (layout: SheetLayout, label: string, source: ImageSourcePropType): PetSheet => ({
  ...layout,
  label,
  source,
  animations: { ...layout.animations },
});

// ---------------------------------------------------------------------------
// Bichon
//
// Each companion is grouped with its evolutions: the evolved sheets first, then
// the base sheet that lists them. That order is load bearing — PET_SHEETS is
// built at module evaluation, so a base sheet cannot name an evolution declared
// below it.
// ---------------------------------------------------------------------------

/**
 * The bichon's runner evolution. Leaner, groomed back, navy bandana and grey
 * socks — the same gear language as the cat's runner, so the builds read as a
 * set rather than as two unrelated redesigns.
 *
 * It was drawn to the base sheet's layout — same eleven bands, same frames per
 * band, same cells left empty — and arrived square on the grid with real alpha
 * and no fringe, so none of it had to be re-laid-out.
 *
 * Its frame map is its own rather than shared with the base, so the evolved form
 * can be animated differently: the two sheets happen to agree cell for cell, but
 * nothing here depends on that, and editing one will not disturb the other.
 *
 * The one change made to the art was scale. It is hard-edged pixel art (48
 * colours) where the base bichon is a soft ~1,800-colour render, and at 128px
 * cells the app's 1.156x upscale to the baby stage put some blocks on two screen
 * pixels and their neighbours on three, which tore the outlines. Doubled to 256px
 * cells with nearest-neighbour — lossless, still 48 colours — which puts every
 * stage in the downscaling regime the cat runner already uses.
 */
const BICHON_RUNNER: PetSheet = {
  name: 'bichon',
  label: 'Bichon · Runner',
  source: require('../../assets/pet/bichonRunner.png'),
  animations: {
    idle: [[0, 0], [0, 1], [0,2]],
    cheer: [[2, 0], [2, 1], [2, 2], [2, 3], [3, 0], [3, 1], [3, 2]],
    move: [[4, 0], [4, 1], [4, 2], [4, 3], [5, 0]],
    // Lying flat, face down, eyes closed — the one frame that reads as peaceful
    // out of context. Single frame on purpose: PetAvatar skips the frame timer
    // under two frames and its bob keeps the pet alive.
    rest: [[9, 2]],
    // The dizzy beats only. The base bichon spends rows 6-8 shading queasy into
    // dizzy across ten frames; this drops that build-up and the row 7 opener,
    // leaving the three cells where the spiral eyes are fully drawn.
    unwell: [[7, 1], [7, 2], [7, 3]],
    // Just the standing-sad beats; the collapse belongs to `faint`.
    sad: [[6, 0],[6,1]],
    // Wobble → collapse → down for good. Row 10 is four frames of lying still.
    faint: [[9, 1], [9, 2], [9, 3], [10, 0], [10, 1], [10, 2], [10, 3]],
  },
};

const BICHON_ANIMATIONS: PetSheet['animations'] = {
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
  sad: [[9,0], [9,1]],
  // Wobble → collapse → down for good. Row 10 is four frames of lying still.
  faint: [[9, 1], [9, 2], [9, 3], [10, 0], [10, 1], [10, 2], [10, 3]],
};

const BICHON_LAYOUT: SheetLayout = { name: 'bichon', animations: BICHON_ANIMATIONS };

const BICHON_LIFTER = sheetFrom(BICHON_LAYOUT, 'Bichon · Lifter', require('../../assets/pet/bichonLifter.png'));
const BICHON_SCHOLAR = sheetFrom(BICHON_LAYOUT, 'Bichon · Scholar', require('../../assets/pet/bichonScholar.png'));

const BICHON: PetSheet = {
  ...sheetFrom(BICHON_LAYOUT, 'Bichon', require('../../assets/pet/bichon.png')),
  evolutions: { runner: BICHON_RUNNER, lifter: BICHON_LIFTER, scholar: BICHON_SCHOLAR },
};

// ---------------------------------------------------------------------------
// Shiba
// ---------------------------------------------------------------------------

/**
 * The shiba's runner evolution: a leaner, sharper-faced shiba with the base's
 * red bandana dropped. Unlike the bichon's and the cat's runners, this sheet was
 * NOT drawn to the base sheet's layout, so it gets its own frame map.
 *
 * It also did not arrive on a grid. The source was 756x2079 -- nominally eleven
 * 189px rows -- but the drawn rows were spaced 183 to 206px apart, so the drift
 * accumulated until row 5's sprite touched the bottom of its cell and row 6's
 * bled into the one above; sliced on the nominal grid it clipped heads and feet.
 * `mobile/scripts/normalizeSpriteSheet.mjs` re-laid it onto a true 4x11 grid,
 * feet-anchored on one baseline, at a 279px cell chosen so the art fills the same
 * share of its cell as the base shiba does (no pixel was resampled -- the cell
 * was sized to the art, not the art to the cell). Every frame now sits 55px off
 * its cell floor with its feet centred within half a pixel, so the pet neither
 * bobs nor slides between frames.
 *
 * What the sheet actually contains, verified band by band: rows 0-1 and 5 are
 * standing, rows 2-4 mix standing with the only five running poses on the sheet,
 * rows 6-7, 9 and 10 are all sitting, and row 8 is lying down. There is no dizzy
 * art, no crying and no collapse -- the same gaps the base shiba has, handled the
 * same way, so `selfDrawn` stays unset and DizzyOrbit keeps carrying `foggy`.
 */
const SHIBA_RUNNER: PetSheet = {
  name: 'shiba',
  label: 'Shiba · Runner',
  source: require('../../assets/pet/shibaRunner.png'),
  animations: {
    // Row 0 only. Its four standing frames are near-redraws of one pose, which
    // reads as a dog shifting its weight; row 1 and row 5 are separate standing
    // draws that differ enough (40-60% of pixels) to look like a jump cut.
    idle: [[0, 3], [0, 3], [0, 2], [0, 3]],
    cheer: [[2, 0], [2, 1], [2, 2], [2, 3]],
    // Every running pose the sheet has, in sheet order. They are scattered
    // across three rows rather than laid out as one band, so this is a gathered
    // cycle rather than the artist's -- the one band worth re-checking on-device.
    move: [[2, 2], [2, 3], [3, 2], [3, 3], [4, 2]],
    // Lying down, eyes open: a dog resting, distinct from the eyes-closed frame
    // that ends `faint`, so exhausted and out-cold do not look identical.
    rest: [[8, 0]],
    // No dizzy band, so the sitting row stands in and DizzyOrbit carries it.
    unwell: [[7, 0], [7, 1], [7, 2], [7, 3]],
    sad: [[6, 0], [6, 1], [6, 2], [6, 3]],
    // Sits, goes down, and stays down: row 8's last frame has the eyes shut,
    // which is the frame HOLDS_LAST_FRAME parks on.
    faint: [[7, 0], [8, 1], [8, 2], [8, 3]],
  },
};

const SHIBA_ANIMATIONS: PetSheet['animations'] = {
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
};

const SHIBA_LAYOUT: SheetLayout = { name: 'shiba', animations: SHIBA_ANIMATIONS };

const SHIBA_LIFTER = sheetFrom(SHIBA_LAYOUT, 'Shiba · Lifter', require('../../assets/pet/shibaLifter.png'));
const SHIBA_SCHOLAR = sheetFrom(SHIBA_LAYOUT, 'Shiba · Scholar', require('../../assets/pet/shibaScholar.png'));

const SHIBA: PetSheet = {
  ...sheetFrom(SHIBA_LAYOUT, 'Shiba', require('../../assets/pet/shiba.png')),
  evolutions: { runner: SHIBA_RUNNER, lifter: SHIBA_LIFTER, scholar: SHIBA_SCHOLAR },
};

// ---------------------------------------------------------------------------
// Otter
// ---------------------------------------------------------------------------

/**
 * A 6-column, 10-row sheet — its own shape, so the layout sets `columns`/`rows`.
 * The source art was not on a clean grid (poses drifted cell to cell and the wide
 * lying poses overran their column), so it was repacked: each pose lifted onto a
 * uniform square cell, centred and stood on a common floor line. The bands, as
 * repacked:
 *
 *   row 0  standing idle (6, last is a back view)
 *   row 1  sitting (6, unused)
 *   row 2  [0] wave  [1] empty  [2] turn  [3-5] arms-up cheer with sparkles
 *   row 3  leaping play (6, unused — cheer already reads as celebration)
 *   row 4  run / swim dash (5, then [4,5] is a dizzy sit)
 *   row 5  crying, hunched (6)
 *   row 6  dizzy: spiral eyes, orbiting stars (3, then a lying beat + scraps)
 *   row 7  curled asleep (6 — a real sleep pose, like the cat's)
 *   row 8  tearful sitting (4, then a back view + scraps)
 *   row 9  stagger → flop → out cold, X eyes (col 4 is messy; [9,5] holds)
 */
const OTTER_ANIMATIONS: PetSheet['animations'] = {
  // Body holds still; the face does the work. Eases out to [0,4] and back so
  // it reads as the otter emoting, not fidgeting.
  idle: [[0, 0], [0,0], [0,0], [0, 1],[0,3], [0,3]],
  // The arms-up, open-mouthed band with the sparkles. Only three drawn frames,
  // so it bounces off the last one rather than cutting straight back.
  cheer: [[2, 3], [2, 4], [2, 5], [2, 4]],
  // The dash band. [4,5] is left out — it is a dizzy sit, not a stride.
  move: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4],[3,3],[3,2]],
  // Curled asleep. Two near-identical tight curls, so the loop is a breath.
  rest: [[7, 0]],
  // Real dizzy art — spiral eyes and its own orbiting stars, so `selfDrawn`
  // drops the DizzyOrbit overlay the shiba leans on.
  unwell: [[6, 0], [6, 1]],
  sad: [[5, 0], [5, 2]],
  // Stagger, stagger, flop forward, down for good. [9,3]/[9,4] are skipped
  // (near-duplicate / muddy); [9,5] is the clean X-eyed collapse
  // HOLDS_LAST_FRAME parks on.
  faint: [[9, 1], [9, 2], [9, 5]],
};

// `columns`/`rows` live here so the derived sheets inherit them: a 6x10 sheet
// read as 4x11 slices every cell in the wrong place and renders garbage.
const OTTER_LAYOUT: SheetLayout = {
  name: 'otter',
  columns: 6,
  rows: 10,
  animations: OTTER_ANIMATIONS,
  selfDrawn: ['foggy'],
  // Short bands, same as the cat — the shared table is paced for the dogs.
  frameMs: { unwell: 340, sad: 340 },
};

const OTTER_LIFTER = sheetFrom(OTTER_LAYOUT, 'Otter · Lifter', require('../../assets/pet/otterLifter.png'));
const OTTER_SCHOLAR = sheetFrom(OTTER_LAYOUT, 'Otter · Scholar', require('../../assets/pet/otterScholar.png'));

const OTTER: PetSheet = {
  ...sheetFrom(OTTER_LAYOUT, 'Otter', require('../../assets/pet/otter.png')),
  evolutions: { lifter: OTTER_LIFTER, scholar: OTTER_SCHOLAR },
};

// ---------------------------------------------------------------------------
// The pack animals — see the note at the top of this file for what they share
// and, more importantly, where each one's art runs out.
// ---------------------------------------------------------------------------

/**
 * Tabby cat, 4x10. The orange cat's replacement, so it takes the cat slot in the
 * picker; `20260909120000_pet_breeds_expand.sql` moves anyone already holding an
 * orange cat onto this one.
 *
 *   rows 0-1  sitting idle (5)        rows 5-7  walk, tail up (9)
 *   rows 2-3  sitting, paw up (7)     row  8    stagger → down, X eyes (4)
 *   row  4    run, stretched low (4)  row  9    lying, X eyes (4)
 */
const TABBY_CAT_LAYOUT: SheetLayout = {
  name: 'tabbyCat',
  rows: 10,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0]],
    cheer: [[2, 0], [2, 1], [2, 2], [2, 3], [3, 0], [3, 1], [3, 2]],
    // The run band, not the nine-frame walk: `move` is what plays while the pet
    // explores, and the dogs map it to their run bands too.
    move: [[4, 0], [4, 1], [4, 2], [4, 3]],
    // No sleep art on this sheet, so `rest` borrows the calmest sit it owns.
    rest: [[2, 0]],
    unwell: [[2, 0], [2, 1], [2, 2], [2, 3]],
    sad: [[3, 0], [3, 1], [3, 2]],
    // Real collapse art: staggers, goes down, and the X-eyed lying frame is what
    // HOLDS_LAST_FRAME parks on.
    faint: [[8, 0], [8, 1], [8, 2], [8, 3], [9, 0]],
  },
};

const TABBY_CAT_LIFTER = sheetFrom(TABBY_CAT_LAYOUT, 'Tabby Cat · Lifter', require('../../assets/pet/tabbyCatLifter.png'));
const TABBY_CAT_SCHOLAR = sheetFrom(TABBY_CAT_LAYOUT, 'Tabby Cat · Scholar', require('../../assets/pet/tabbyCatScholar.png'));

const TABBY_CAT: PetSheet = {
  ...sheetFrom(TABBY_CAT_LAYOUT, 'Tabby Cat', require('../../assets/pet/tabbyCat.png')),
  evolutions: { lifter: TABBY_CAT_LIFTER, scholar: TABBY_CAT_SCHOLAR },
};

/**
 * Bunny, 4x7. One of the two sheets with a genuine sleep band, so its `rest` is
 * the pose it claims to be rather than a stand-in.
 *
 *   row  0    sitting idle (4)        rows 3-4  up on hind legs, happy (6)
 *   row  1    sitting, looking (4)    row  5    sit → eyes shut → lie down (4)
 *   row  2    hopping (4)             row  6    lying asleep (4)
 */
const BUNNY_LAYOUT: SheetLayout = {
  name: 'bunny',
  rows: 7,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3]],
    cheer: [[3, 0], [3, 1], [3, 2], [3, 3], [4, 0], [4, 1]],
    move: [[2, 0], [2, 1], [2, 2], [2, 3]],
    // Actually asleep — flat, ears down, eyes closed.
    rest: [[6, 0], [6, 1], [6, 2], [6, 3]],
    // No dizzy or crying art, so the second sitting band carries both and
    // DizzyOrbit supplies the `foggy` reading, exactly as it does for the shiba.
    unwell: [[1, 0], [1, 1], [1, 2], [1, 3]],
    sad: [[1, 0], [1, 1], [1, 2], [1, 3]],
    // Settles rather than collapses — this sheet has no knocked-out pose.
    faint: [[5, 0], [5, 1], [5, 2], [5, 3]],
  },
};

const BUNNY_LIFTER = sheetFrom(BUNNY_LAYOUT, 'Bunny · Lifter', require('../../assets/pet/bunnyLifter.png'));
const BUNNY_SCHOLAR = sheetFrom(BUNNY_LAYOUT, 'Bunny · Scholar', require('../../assets/pet/bunnyScholar.png'));

const BUNNY: PetSheet = {
  ...sheetFrom(BUNNY_LAYOUT, 'Bunny', require('../../assets/pet/bunny.png')),
  evolutions: { lifter: BUNNY_LIFTER, scholar: BUNNY_SCHOLAR },
};

/**
 * Fox, 4x8. The other sheet with real sleep art.
 *
 *   row  0    sitting idle (3)        rows 4-5  sitting alert (5)
 *   rows 1-2  sitting, eyes shut (5)  row  6    lying down (4)
 *   row  3    running (4)             row  7    lying asleep (4)
 */
const FOX_LAYOUT: SheetLayout = {
  name: 'fox',
  rows: 8,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2]],
    // Eyes shut and clearly pleased — the closest this sheet has to celebrating.
    cheer: [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0]],
    move: [[3, 0], [3, 1], [3, 2], [3, 3]],
    rest: [[7, 0], [7, 1], [7, 2], [7, 3]],
    unwell: [[4, 0], [4, 1], [4, 2], [4, 3]],
    sad: [[4, 0], [4, 1], [4, 2], [4, 3]],
    faint: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0]],
  },
};

const FOX_LIFTER = sheetFrom(FOX_LAYOUT, 'Fox · Lifter', require('../../assets/pet/foxLifter.png'));
const FOX_SCHOLAR = sheetFrom(FOX_LAYOUT, 'Fox · Scholar', require('../../assets/pet/foxScholar.png'));

const FOX: PetSheet = {
  ...sheetFrom(FOX_LAYOUT, 'Fox', require('../../assets/pet/fox.png')),
  evolutions: { lifter: FOX_LIFTER, scholar: FOX_SCHOLAR },
};

/**
 * Koala, 4x10. The one sheet in the pack with no locomotion band at all — it is
 * drawn sitting in every frame it owns, so `move` borrows its second sitting
 * band. A koala that does not run is in character, but it does mean the walk cue
 * is carried by the scene rather than the sprite.
 *
 *   rows 0-1  sitting idle (5)        rows 6-7  sitting, downcast (6)
 *   rows 2-3  sitting, shifting (6)   row  8    slumps down (4)
 *   rows 4-5  arms up, delighted (5)  row  9    down, orbiting stars (3)
 */
const KOALA_LAYOUT: SheetLayout = {
  name: 'koala',
  rows: 10,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0]],
    cheer: [[4, 0], [4, 1], [4, 2], [4, 3], [5, 0]],
    move: [[2, 0], [2, 1], [2, 2], [2, 3], [3, 0], [3, 1]],
    rest: [[2, 0]],
    unwell: [[6, 0], [6, 1], [6, 2], [6, 3]],
    sad: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1]],
    // The last row draws its own orbiting stars, but only lying down, so it ends
    // `faint` rather than standing in for `unwell` — `selfDrawn` stays unset.
    faint: [[8, 0], [8, 1], [8, 2], [8, 3], [9, 0]],
  },
};

const KOALA_LIFTER = sheetFrom(KOALA_LAYOUT, 'Koala · Lifter', require('../../assets/pet/koalaLifter.png'));
const KOALA_SCHOLAR = sheetFrom(KOALA_LAYOUT, 'Koala · Scholar', require('../../assets/pet/koalaScholar.png'));

const KOALA: PetSheet = {
  ...sheetFrom(KOALA_LAYOUT, 'Koala', require('../../assets/pet/koala.png')),
  evolutions: { lifter: KOALA_LIFTER, scholar: KOALA_SCHOLAR },
};

/**
 * Bear, 4x8. Carries a honey pot through its first two bands and puts it down
 * for the rest, which is why `idle` and `cheer` come from the pot bands and
 * everything calmer comes from the standing ones.
 *
 *   rows 0-2  sitting with the pot (9)   rows 4-5  standing, no pot (7)
 *   row  3    carrying the pot (4)       rows 6-7  fades away to nothing (5)
 */
const BEAR_LAYOUT: SheetLayout = {
  name: 'bear',
  rows: 8,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3]],
    // Face in the honey pot: this sheet's happiest frames by a distance.
    cheer: [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0]],
    move: [[3, 0], [3, 1], [3, 2], [3, 3]],
    rest: [[4, 0]],
    unwell: [[4, 0], [4, 1], [4, 2], [4, 3]],
    sad: [[5, 0], [5, 1], [5, 2]],
    // Drawn as a fade rather than a collapse -- the last cells are the same bear
    // at falling alpha, so the order matters and the faintest must come last.
    faint: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0]],
  },
};

const BEAR_LIFTER = sheetFrom(BEAR_LAYOUT, 'Bear · Lifter', require('../../assets/pet/bearLifter.png'));
const BEAR_SCHOLAR = sheetFrom(BEAR_LAYOUT, 'Bear · Scholar', require('../../assets/pet/bearScholar.png'));

const BEAR: PetSheet = {
  ...sheetFrom(BEAR_LAYOUT, 'Bear', require('../../assets/pet/bear.png')),
  evolutions: { lifter: BEAR_LIFTER, scholar: BEAR_SCHOLAR },
};

/**
 * Axolotl, 4x9. The best supplied of the pack: it is the only one with a band
 * drawn specifically as distress, so its `unwell` is a real pose rather than a
 * borrowed sit.
 *
 *   row  0    sitting idle (4)        rows 5-6  sitting, downcast (6)
 *   rows 1-2  arms up, delighted (7)  row  7    distressed, mouth open (4)
 *   rows 3-4  swimming forward (5)    row  8    down, X eyes (3)
 */
const AXOLOTL_LAYOUT: SheetLayout = {
  name: 'axolotl',
  rows: 9,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3],[0,2],[0,1]],
    cheer: [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2]],
    move: [[3, 0], [3, 1], [3, 2], [3, 3], [4, 0]],
    rest: [[5, 0]],
    unwell: [[7, 0], [7, 1], [7, 2], [7, 3]],
    sad: [[5, 0], [5, 1], [5, 2], [5, 3], [6, 0], [6, 1]],
    faint: [[8, 0], [8, 1], [8, 2]],
  },
};

const AXOLOTL_LIFTER = sheetFrom(AXOLOTL_LAYOUT, 'Axolotl · Lifter', require('../../assets/pet/axolotlLifter.png'));
const AXOLOTL_SCHOLAR = sheetFrom(AXOLOTL_LAYOUT, 'Axolotl · Scholar', require('../../assets/pet/axolotlScholar.png'));

const AXOLOTL: PetSheet = {
  ...sheetFrom(AXOLOTL_LAYOUT, 'Axolotl', require('../../assets/pet/axolotl.png')),
  evolutions: { lifter: AXOLOTL_LIFTER, scholar: AXOLOTL_SCHOLAR },
};

/**
 * Dino, 4x10. A little green dinosaur in a blue cap.
 *
 *   row  0    sitting idle (4)        rows 6-7  standing, downcast (5)
 *   row  1    standing (4)            row  8    sits down, X eyes (4)
 *   rows 2-3  arms up, delighted (5)  row  9    lying, X eyes (4)
 *   rows 4-5  running (5)
 */
const DINO_LAYOUT: SheetLayout = {
  name: 'dino',
  rows: 10,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3]],
    cheer: [[2, 0], [2, 1], [2, 2], [2, 3], [3, 0]],
    move: [[4, 0], [4, 1], [4, 2], [4, 3], [5, 0]],
    // No sleep art -- row 9 looks like one until you zoom in and find X eyes, so
    // it belongs to `faint`. The standing band stands in here instead.
    rest: [[1, 0]],
    unwell: [[6, 0], [6, 1], [6, 2], [6, 3]],
    sad: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0]],
    faint: [[8, 0], [8, 1], [8, 2], [8, 3], [9, 0]],
  },
};

const DINO_LIFTER = sheetFrom(DINO_LAYOUT, 'Dino · Lifter', require('../../assets/pet/dinoLifter.png'));
const DINO_SCHOLAR = sheetFrom(DINO_LAYOUT, 'Dino · Scholar', require('../../assets/pet/dinoScholar.png'));

const DINO: PetSheet = {
  ...sheetFrom(DINO_LAYOUT, 'Dino', require('../../assets/pet/dino.png')),
  evolutions: { lifter: DINO_LIFTER, scholar: DINO_SCHOLAR },
};

/** Adoptable companions, in the order the breed picker offers them. */
export const PET_SHEETS: PetSheet[] = [
  BICHON,
  SHIBA,
  OTTER,
  TABBY_CAT,
  BUNNY,
  FOX,
  KOALA,
  BEAR,
  AXOLOTL,
  DINO,
];

export const sheetByBreed = (breed: PetBreed): PetSheet =>
  PET_SHEETS.find((sheet) => sheet.name === breed) ?? PET_SHEETS[0];

/**
 * The sheet a pet is drawn from, evolutions included.
 *
 * `level`, `endurance`, `strength` and `mind` are optional so the still previews
 * in the breed picker can ask for a breed's base look without inventing a pet: a
 * partial pet has no level, reads as `baby`, and so never resolves to an evolved
 * form.
 */
export const sheetForPet = (
  pet: Pick<PetState, 'id' | 'breed'> & Partial<Pick<PetState, 'level' | 'endurance' | 'strength' | 'mind'>>,
): PetSheet => {
  const base = baseSheetForPet(pet);
  // Gated on level as well as build: a level-2 pet that has been walked a lot has
  // not been raised long enough for how it was raised to mean anything yet.
  if ((pet.level ?? 1) < EVOLUTION_LEVEL) return base;
  const build = getPetBuild({
    endurance: pet.endurance ?? 0,
    strength: pet.strength ?? 0,
    mind: pet.mind ?? 0,
  });
  return base.evolutions?.[build] ?? base;
};

/**
 * The chosen breed wins. Pets adopted before the picker existed have none, so they
 * fall back to a stable hash of their id rather than all becoming the same dog.
 */
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
