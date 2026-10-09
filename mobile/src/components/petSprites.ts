import type { ImageSourcePropType } from 'react-native';
import { EVOLUTION_LEVEL, getPetBuild, type PetAilment, type PetBreed, type PetBuild, type PetState } from '@vitto/core';

/**
 * Every sheet is a 4-column grid of square cells; a sheet with more or fewer
 * than 11 rows carries its own `rows`. Rows come in bands, and the frame lists
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
 *   koala           a walk but no run, and no sleep
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
   * The pack sheets and the video-cut forms set their own row counts;
   * everything else omits these and takes the default.
   */
  columns?: number;
  rows?: number;
  /**
   * Shrinks this sheet's art within its cell, without redrawing it.
   *
   * How big a pet looks is set entirely by the share of its cell the art fills,
   * since `SpriteFrame` maps one cell onto whatever size it is given. The breeds
   * do not agree on that share: the bichon was drawn to about two thirds of its
   * cell where the shiba and the cat sit near half, so at the same `size` the
   * bichon towered over them. This dials one sheet back to match rather than
   * re-laying the art, and `SpriteFrame` keeps the cell floor pinned so the pet
   * shrinks in place instead of hovering or drifting.
   *
   * Omitted means 1: the art fills its cell exactly as drawn.
   */
  artScale?: number;
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
  /**
   * Animation clips that play instead of this sheet's frames, where a form was
   * animated as video rather than drawn as a sheet. Played by `PetVideo` on iOS
   * and web; everywhere else (Android, the still previews, the Dynamic Island)
   * the sheet above still stands in.
   */
  videos?: PetVideos;
}

export interface PetVideoClip {
  /** HEVC with alpha: what iOS and Safari play transparent. */
  hevc: number;
  /** VP9 with alpha: what Chrome, Firefox and Edge play transparent. */
  webm: number;
  /** Loops, or plays once and stays on its last frame. */
  loop: boolean;
}

export interface PetVideos {
  clips: Partial<Record<PetAnimation, PetVideoClip>>;
  /** Pixel size of the (square) video frame. */
  frameSize: number;
  /**
   * The square region of the video frame, in video pixels, that lines up with
   * one sheet cell. It is what makes a clip stand where the sheet's art stands
   * and at the same size: the video is scaled so this region fills the cell.
   */
  cell: { x: number; y: number; size: number };
  /** Like `PetSheet.selfDrawn`, for what the clips draw themselves. */
  selfDrawn?: readonly PetAilment[];
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

/** `count` cells laid four to a row from `row` on: one band of a sheet cut by buildVideoSheet.mjs. */
const gridBand = (row: number, count: number): [number, number][] =>
  Array.from({ length: count }, (_, i) => [row + Math.floor(i / 4), i % 4] as [number, number]);

/**
 * The band layout buildVideoSheet.mjs lays every GIF-cut form out in (the otter
 * and the bichon and shiba runners): seven bands in this order, each starting
 * on a fresh row, `counts` frames apiece. It prints the same map when it runs.
 */
const gifFormBands = (counts: { idle?: number; unwell: number }): PetSheet['animations'] => {
  const order: [PetAnimation, number][] = [
    ['idle', counts.idle ?? 12],
    ['cheer', 12],
    ['move', 6],
    ['rest', 8],
    ['unwell', counts.unwell],
    ['sad', 8],
    // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
    ['faint', 8],
  ];
  const bands = {} as PetSheet['animations'];
  let row = 0;
  for (const [name, count] of order) {
    bands[name] = gridBand(row, count);
    row += Math.ceil(count / 4);
  }
  return bands;
};

/**
 * A runner's clips, as buildLifterVideos.mjs names them, mapped onto the
 * animations. `lie` is the lie-down's lying-still tail, looped, so resting
 * does not replay the fall; sad and faint play once and stay put.
 */
const runnerClips = (files: Record<'idle' | 'cheer' | 'run' | 'dizzy' | 'tired' | 'lie-down' | 'lie', { hevc: number; webm: number }>): PetVideos['clips'] => ({
  idle: { ...files.idle, loop: true },
  cheer: { ...files.cheer, loop: true },
  move: { ...files.run, loop: true },
  unwell: { ...files.dizzy, loop: true },
  rest: { ...files.lie, loop: true },
  sad: { ...files.tired, loop: false },
  faint: { ...files['lie-down'], loop: false },
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
 * The bichon is drawn larger for its cell than any other breed — about two
 * thirds of the cell tall where the shiba and the cat are near half — so at a
 * shared `size` it read as a different, bigger animal rather than as one of the
 * set. Every bichon form is dialled back by the same factor so they stay a
 * family, and so the evolutions do not change size relative to the base.
 */
const BICHON_ART_SCALE = 0.78;

/**
 * The bichon's runner evolution: orange headband, blue bow and a gold medal.
 * Animated as GIFs like the bunny's forms; its sheet is cut from the same clips
 * by `node scripts/buildVideoSheet.mjs bichonRunner` in the box `cell` gives
 * the clips, so the two line up, and it shares the family's artScale.
 */
const BICHON_RUNNER_CLIPS = {
  idle: { hevc: require('../../assets/pet/video/bichonRunner/idle.mov'), webm: require('../../assets/pet/video/bichonRunner/idle.webm') },
  cheer: { hevc: require('../../assets/pet/video/bichonRunner/cheer.mov'), webm: require('../../assets/pet/video/bichonRunner/cheer.webm') },
  run: { hevc: require('../../assets/pet/video/bichonRunner/run.mov'), webm: require('../../assets/pet/video/bichonRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/bichonRunner/dizzy.mov'), webm: require('../../assets/pet/video/bichonRunner/dizzy.webm') },
  tired: { hevc: require('../../assets/pet/video/bichonRunner/tired.mov'), webm: require('../../assets/pet/video/bichonRunner/tired.webm') },
  'lie-down': { hevc: require('../../assets/pet/video/bichonRunner/lie-down.mov'), webm: require('../../assets/pet/video/bichonRunner/lie-down.webm') },
  lie: { hevc: require('../../assets/pet/video/bichonRunner/lie.mov'), webm: require('../../assets/pet/video/bichonRunner/lie.webm') },
};

const BICHON_RUNNER: PetSheet = {
  name: 'bichon',
  label: 'Bichon · Runner',
  source: require('../../assets/pet/bichonRunner.png'),
  // Its idle is just the tail wag (eight frames, eyes open), a row shorter.
  rows: 15,
  artScale: BICHON_ART_SCALE,
  animations: gifFormBands({ idle: 8, unwell: 6 }),
  selfDrawn: ['foggy'],
  frameMs: { idle: 167, cheer: 167, move: 167, rest: 333, unwell: 167, sad: 500, faint: 250 },
  videos: {
    frameSize: 768,
    cell: { x: 86, y: 79, size: 598 },
    clips: runnerClips(BICHON_RUNNER_CLIPS),
    // The dizzy clip has its own spiral eyes and ring of stars.
    selfDrawn: ['foggy'],
  },
};

const BICHON_ANIMATIONS: PetSheet['animations'] = {
  idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1,1], [1,1], [1,1], [1,1]],
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

const BICHON_LAYOUT: SheetLayout = { name: 'bichon', animations: BICHON_ANIMATIONS, artScale: BICHON_ART_SCALE };

/**
 * The bichon lifter's animation clips: muscled up, red sweatband, blue bow.
 * `scripts/buildBichonLifterVideos.mjs` makes these from the originals in
 * `assets/source/video/bichon-lifter/`, changing nothing but the background
 * (off-white → transparent). Every frame and the frame rate are the originals'.
 *
 * `cell` was measured off the clips: the standing dog fills the same share of
 * that square as the base bichon fills its cell, with its feet on the same
 * floor line, and the widest pose (the flex) and the highest (top of a jump)
 * both stay inside it.
 */
/**
 * Both encodings of one clip. Metro needs each `require` spelled out, so this
 * is a table rather than a template.
 */
const BICHON_LIFTER_CLIPS = {
  idle: { hevc: require('../../assets/pet/video/bichonLifter/idle.mov'), webm: require('../../assets/pet/video/bichonLifter/idle.webm') },
  'idle-flex': { hevc: require('../../assets/pet/video/bichonLifter/idle-flex.mov'), webm: require('../../assets/pet/video/bichonLifter/idle-flex.webm') },
  jump: { hevc: require('../../assets/pet/video/bichonLifter/jump.mov'), webm: require('../../assets/pet/video/bichonLifter/jump.webm') },
  walk: { hevc: require('../../assets/pet/video/bichonLifter/walk.mov'), webm: require('../../assets/pet/video/bichonLifter/walk.webm') },
  dizzy: { hevc: require('../../assets/pet/video/bichonLifter/dizzy.mov'), webm: require('../../assets/pet/video/bichonLifter/dizzy.webm') },
  hurt: { hevc: require('../../assets/pet/video/bichonLifter/hurt.mov'), webm: require('../../assets/pet/video/bichonLifter/hurt.webm') },
};
const clip = (name: keyof typeof BICHON_LIFTER_CLIPS) => BICHON_LIFTER_CLIPS[name];

const BICHON_LIFTER_VIDEOS: PetVideos = {
  frameSize: 768,
  cell: { x: 92, y: 104, size: 576 },
  clips: {
    // Stands about for most of the clip, then rears up into a double-bicep flex.
    idle: { ...clip('idle-flex'), loop: true },
    rest: { ...clip('idle'), loop: true },
    // The celebration after logging food (and while eating).
    cheer: { ...clip('jump'), loop: true },
    move: { ...clip('walk'), loop: true },
    unwell: { ...clip('dizzy'), loop: true },
    // Yelp → dazed → wince → pout, played once. Looping it would have the pet
    // get hurt over and over.
    sad: { ...clip('hurt'), loop: false },
    faint: { ...clip('hurt'), loop: false },
  },
  // The dizzy clip has its own spiral eyes and orbiting stars.
  selfDrawn: ['foggy'],
};

const BICHON_LIFTER: PetSheet = {
  ...sheetFrom(BICHON_LAYOUT, 'Bichon · Lifter', require('../../assets/pet/bichonLifter.png')),
  videos: BICHON_LIFTER_VIDEOS,
};
const BICHON_SCHOLAR = sheetFrom(BICHON_LAYOUT, 'Bichon · Scholar', require('../../assets/pet/bichonScholar.png'));

const BICHON: PetSheet = {
  ...sheetFrom(BICHON_LAYOUT, 'Bichon', require('../../assets/pet/bichon.png')),
  evolutions: { runner: BICHON_RUNNER, lifter: BICHON_LIFTER, scholar: BICHON_SCHOLAR },
};

// ---------------------------------------------------------------------------
// Shiba
// ---------------------------------------------------------------------------

/**
 * The shiba's runner evolution: orange headband, red bandana and a gold
 * medal. Animated as GIFs like the bichon runner; its sheet is cut from the
 * same clips by `node scripts/buildVideoSheet.mjs shibaRunner` in the box
 * `cell` gives the clips. Unlike the base shiba it has real dizzy art.
 */
const SHIBA_RUNNER_CLIPS = {
  idle: { hevc: require('../../assets/pet/video/shibaRunner/idle.mov'), webm: require('../../assets/pet/video/shibaRunner/idle.webm') },
  cheer: { hevc: require('../../assets/pet/video/shibaRunner/cheer.mov'), webm: require('../../assets/pet/video/shibaRunner/cheer.webm') },
  run: { hevc: require('../../assets/pet/video/shibaRunner/run.mov'), webm: require('../../assets/pet/video/shibaRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/shibaRunner/dizzy.mov'), webm: require('../../assets/pet/video/shibaRunner/dizzy.webm') },
  tired: { hevc: require('../../assets/pet/video/shibaRunner/tired.mov'), webm: require('../../assets/pet/video/shibaRunner/tired.webm') },
  'lie-down': { hevc: require('../../assets/pet/video/shibaRunner/lie-down.mov'), webm: require('../../assets/pet/video/shibaRunner/lie-down.webm') },
  lie: { hevc: require('../../assets/pet/video/shibaRunner/lie.mov'), webm: require('../../assets/pet/video/shibaRunner/lie.webm') },
};

const SHIBA_RUNNER: PetSheet = {
  name: 'shiba',
  label: 'Shiba · Runner',
  source: require('../../assets/pet/shibaRunner.png'),
  rows: 16,
  animations: gifFormBands({ unwell: 8 }),
  selfDrawn: ['foggy'],
  frameMs: { idle: 333, cheer: 167, move: 167, rest: 333, unwell: 167, sad: 500, faint: 250 },
  videos: {
    frameSize: 768,
    cell: { x: -13, y: -26, size: 796 },
    clips: runnerClips(SHIBA_RUNNER_CLIPS),
    selfDrawn: ['foggy'],
  },
};

const SHIBA_ANIMATIONS: PetSheet['animations'] = {
  idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1,1], [1, 1], [1, 1],[1, 1]],
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

/**
 * The otter is cut at the bunny's size, but its round, chunky build read as
 * bigger than the rest, so it is drawn a little smaller, feet still on the
 * floor. Its evolved forms share it.
 */
const OTTER_ART_SCALE = 0.85;

// ---------------------------------------------------------------------------
// The generated set of evolved forms: tabby cat, dino, fox, koala and otter
// ---------------------------------------------------------------------------

/*
 * Every one of these forms arrived as the same six GIFs (idle or idle-flex,
 * celebrating, run, dizzy, sad, dying) drawn to the same timing, so they share
 * one shape: scripts/gifForms.mjs holds their boxes and loop points, and
 * buildVideoSheet.mjs / buildLifterVideos.mjs expand it into each form's sheet
 * and clips. Each pet's three forms share one box (`GIF_FORM_CELLS`), sized so
 * evolving does not resize the pet.
 */
type GifFormFiles = Record<'idle' | 'celebrating' | 'run' | 'dizzy' | 'sad' | 'dying' | 'lie', { hevc: number; webm: number }>;

const GIF_FORM_CELLS = {
  tabbyCat: { x: -14, y: -4, size: 795 },
  dino: { x: -4, y: -16, size: 779 },
  fox: { x: -8, y: -34, size: 783 },
  koala: { x: -43, y: -116, size: 856 },
  otter: { x: 25, y: 15, size: 720 },
} as const;

const gifFormSheet = (
  breed: PetBreed,
  label: string,
  source: ImageSourcePropType,
  files: GifFormFiles,
  artScale?: number,
): PetSheet => ({
  name: breed,
  label,
  source,
  rows: 16,
  ...(artScale ? { artScale } : {}),
  animations: gifFormBands({ unwell: 8 }),
  // Every form's dizzy clip draws its own spiral eyes and stars.
  selfDrawn: ['foggy'],
  frameMs: { idle: 333, cheer: 167, move: 167, rest: 333, unwell: 500, sad: 500, faint: 250 },
  videos: {
    frameSize: 768,
    cell: GIF_FORM_CELLS[breed as keyof typeof GIF_FORM_CELLS],
    clips: {
      idle: { ...files.idle, loop: true },
      cheer: { ...files.celebrating, loop: true },
      move: { ...files.run, loop: true },
      unwell: { ...files.dizzy, loop: true },
      // Lying still, looped: the dying clip's last frames, without the fall.
      rest: { ...files.lie, loop: true },
      // Settle into a pose and stay there, rather than starting over.
      sad: { ...files.sad, loop: false },
      faint: { ...files.dying, loop: false },
    },
    selfDrawn: ['foggy'],
  },
});

const TABBY_CAT_LIFTER = gifFormSheet('tabbyCat', 'Tabby Cat · Lifter', require('../../assets/pet/tabbyCatLifter.png'), {
  idle: { hevc: require('../../assets/pet/video/tabbyCatLifter/idle-flex.mov'), webm: require('../../assets/pet/video/tabbyCatLifter/idle-flex.webm') },
  celebrating: { hevc: require('../../assets/pet/video/tabbyCatLifter/celebrating.mov'), webm: require('../../assets/pet/video/tabbyCatLifter/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/tabbyCatLifter/run.mov'), webm: require('../../assets/pet/video/tabbyCatLifter/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/tabbyCatLifter/dizzy.mov'), webm: require('../../assets/pet/video/tabbyCatLifter/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/tabbyCatLifter/sad.mov'), webm: require('../../assets/pet/video/tabbyCatLifter/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/tabbyCatLifter/dying.mov'), webm: require('../../assets/pet/video/tabbyCatLifter/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/tabbyCatLifter/lie.mov'), webm: require('../../assets/pet/video/tabbyCatLifter/lie.webm') },
});

const TABBY_CAT_RUNNER = gifFormSheet('tabbyCat', 'Tabby Cat · Runner', require('../../assets/pet/tabbyCatRunner.png'), {
  idle: { hevc: require('../../assets/pet/video/tabbyCatRunner/idle.mov'), webm: require('../../assets/pet/video/tabbyCatRunner/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/tabbyCatRunner/celebrating.mov'), webm: require('../../assets/pet/video/tabbyCatRunner/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/tabbyCatRunner/run.mov'), webm: require('../../assets/pet/video/tabbyCatRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/tabbyCatRunner/dizzy.mov'), webm: require('../../assets/pet/video/tabbyCatRunner/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/tabbyCatRunner/sad.mov'), webm: require('../../assets/pet/video/tabbyCatRunner/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/tabbyCatRunner/dying.mov'), webm: require('../../assets/pet/video/tabbyCatRunner/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/tabbyCatRunner/lie.mov'), webm: require('../../assets/pet/video/tabbyCatRunner/lie.webm') },
});

const TABBY_CAT_SCHOLAR = gifFormSheet('tabbyCat', 'Tabby Cat · Scholar', require('../../assets/pet/tabbyCatScholar.png'), {
  idle: { hevc: require('../../assets/pet/video/tabbyCatScholar/idle.mov'), webm: require('../../assets/pet/video/tabbyCatScholar/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/tabbyCatScholar/celebrating.mov'), webm: require('../../assets/pet/video/tabbyCatScholar/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/tabbyCatScholar/run.mov'), webm: require('../../assets/pet/video/tabbyCatScholar/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/tabbyCatScholar/dizzy.mov'), webm: require('../../assets/pet/video/tabbyCatScholar/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/tabbyCatScholar/sad.mov'), webm: require('../../assets/pet/video/tabbyCatScholar/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/tabbyCatScholar/dying.mov'), webm: require('../../assets/pet/video/tabbyCatScholar/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/tabbyCatScholar/lie.mov'), webm: require('../../assets/pet/video/tabbyCatScholar/lie.webm') },
});

const DINO_LIFTER = gifFormSheet('dino', 'Dino · Lifter', require('../../assets/pet/dinoLifter.png'), {
  idle: { hevc: require('../../assets/pet/video/dinoLifter/idle-flex.mov'), webm: require('../../assets/pet/video/dinoLifter/idle-flex.webm') },
  celebrating: { hevc: require('../../assets/pet/video/dinoLifter/celebrating.mov'), webm: require('../../assets/pet/video/dinoLifter/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/dinoLifter/run.mov'), webm: require('../../assets/pet/video/dinoLifter/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/dinoLifter/dizzy.mov'), webm: require('../../assets/pet/video/dinoLifter/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/dinoLifter/sad.mov'), webm: require('../../assets/pet/video/dinoLifter/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/dinoLifter/dying.mov'), webm: require('../../assets/pet/video/dinoLifter/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/dinoLifter/lie.mov'), webm: require('../../assets/pet/video/dinoLifter/lie.webm') },
});

const DINO_RUNNER = gifFormSheet('dino', 'Dino · Runner', require('../../assets/pet/dinoRunner.png'), {
  idle: { hevc: require('../../assets/pet/video/dinoRunner/idle.mov'), webm: require('../../assets/pet/video/dinoRunner/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/dinoRunner/celebrating.mov'), webm: require('../../assets/pet/video/dinoRunner/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/dinoRunner/run.mov'), webm: require('../../assets/pet/video/dinoRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/dinoRunner/dizzy.mov'), webm: require('../../assets/pet/video/dinoRunner/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/dinoRunner/sad.mov'), webm: require('../../assets/pet/video/dinoRunner/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/dinoRunner/dying.mov'), webm: require('../../assets/pet/video/dinoRunner/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/dinoRunner/lie.mov'), webm: require('../../assets/pet/video/dinoRunner/lie.webm') },
});

const DINO_SCHOLAR = gifFormSheet('dino', 'Dino · Scholar', require('../../assets/pet/dinoScholar.png'), {
  idle: { hevc: require('../../assets/pet/video/dinoScholar/idle.mov'), webm: require('../../assets/pet/video/dinoScholar/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/dinoScholar/celebrating.mov'), webm: require('../../assets/pet/video/dinoScholar/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/dinoScholar/run.mov'), webm: require('../../assets/pet/video/dinoScholar/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/dinoScholar/dizzy.mov'), webm: require('../../assets/pet/video/dinoScholar/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/dinoScholar/sad.mov'), webm: require('../../assets/pet/video/dinoScholar/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/dinoScholar/dying.mov'), webm: require('../../assets/pet/video/dinoScholar/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/dinoScholar/lie.mov'), webm: require('../../assets/pet/video/dinoScholar/lie.webm') },
});

const FOX_LIFTER = gifFormSheet('fox', 'Fox · Lifter', require('../../assets/pet/foxLifter.png'), {
  idle: { hevc: require('../../assets/pet/video/foxLifter/idle-flex.mov'), webm: require('../../assets/pet/video/foxLifter/idle-flex.webm') },
  celebrating: { hevc: require('../../assets/pet/video/foxLifter/celebrating.mov'), webm: require('../../assets/pet/video/foxLifter/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/foxLifter/run.mov'), webm: require('../../assets/pet/video/foxLifter/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/foxLifter/dizzy.mov'), webm: require('../../assets/pet/video/foxLifter/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/foxLifter/sad.mov'), webm: require('../../assets/pet/video/foxLifter/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/foxLifter/dying.mov'), webm: require('../../assets/pet/video/foxLifter/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/foxLifter/lie.mov'), webm: require('../../assets/pet/video/foxLifter/lie.webm') },
});

const FOX_RUNNER = gifFormSheet('fox', 'Fox · Runner', require('../../assets/pet/foxRunner.png'), {
  idle: { hevc: require('../../assets/pet/video/foxRunner/idle.mov'), webm: require('../../assets/pet/video/foxRunner/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/foxRunner/celebrating.mov'), webm: require('../../assets/pet/video/foxRunner/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/foxRunner/run.mov'), webm: require('../../assets/pet/video/foxRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/foxRunner/dizzy.mov'), webm: require('../../assets/pet/video/foxRunner/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/foxRunner/sad.mov'), webm: require('../../assets/pet/video/foxRunner/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/foxRunner/dying.mov'), webm: require('../../assets/pet/video/foxRunner/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/foxRunner/lie.mov'), webm: require('../../assets/pet/video/foxRunner/lie.webm') },
});

const FOX_SCHOLAR = gifFormSheet('fox', 'Fox · Scholar', require('../../assets/pet/foxScholar.png'), {
  idle: { hevc: require('../../assets/pet/video/foxScholar/idle.mov'), webm: require('../../assets/pet/video/foxScholar/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/foxScholar/celebrating.mov'), webm: require('../../assets/pet/video/foxScholar/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/foxScholar/run.mov'), webm: require('../../assets/pet/video/foxScholar/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/foxScholar/dizzy.mov'), webm: require('../../assets/pet/video/foxScholar/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/foxScholar/sad.mov'), webm: require('../../assets/pet/video/foxScholar/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/foxScholar/dying.mov'), webm: require('../../assets/pet/video/foxScholar/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/foxScholar/lie.mov'), webm: require('../../assets/pet/video/foxScholar/lie.webm') },
});

const KOALA_LIFTER = gifFormSheet('koala', 'Koala · Lifter', require('../../assets/pet/koalaLifter.png'), {
  idle: { hevc: require('../../assets/pet/video/koalaLifter/idle-flex.mov'), webm: require('../../assets/pet/video/koalaLifter/idle-flex.webm') },
  celebrating: { hevc: require('../../assets/pet/video/koalaLifter/celebrating.mov'), webm: require('../../assets/pet/video/koalaLifter/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/koalaLifter/run.mov'), webm: require('../../assets/pet/video/koalaLifter/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/koalaLifter/dizzy.mov'), webm: require('../../assets/pet/video/koalaLifter/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/koalaLifter/sad.mov'), webm: require('../../assets/pet/video/koalaLifter/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/koalaLifter/dying.mov'), webm: require('../../assets/pet/video/koalaLifter/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/koalaLifter/lie.mov'), webm: require('../../assets/pet/video/koalaLifter/lie.webm') },
});

const KOALA_RUNNER = gifFormSheet('koala', 'Koala · Runner', require('../../assets/pet/koalaRunner.png'), {
  idle: { hevc: require('../../assets/pet/video/koalaRunner/idle.mov'), webm: require('../../assets/pet/video/koalaRunner/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/koalaRunner/celebrating.mov'), webm: require('../../assets/pet/video/koalaRunner/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/koalaRunner/run.mov'), webm: require('../../assets/pet/video/koalaRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/koalaRunner/dizzy.mov'), webm: require('../../assets/pet/video/koalaRunner/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/koalaRunner/sad.mov'), webm: require('../../assets/pet/video/koalaRunner/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/koalaRunner/dying.mov'), webm: require('../../assets/pet/video/koalaRunner/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/koalaRunner/lie.mov'), webm: require('../../assets/pet/video/koalaRunner/lie.webm') },
});

const KOALA_SCHOLAR = gifFormSheet('koala', 'Koala · Scholar', require('../../assets/pet/koalaScholar.png'), {
  idle: { hevc: require('../../assets/pet/video/koalaScholar/idle.mov'), webm: require('../../assets/pet/video/koalaScholar/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/koalaScholar/celebrating.mov'), webm: require('../../assets/pet/video/koalaScholar/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/koalaScholar/run.mov'), webm: require('../../assets/pet/video/koalaScholar/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/koalaScholar/dizzy.mov'), webm: require('../../assets/pet/video/koalaScholar/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/koalaScholar/sad.mov'), webm: require('../../assets/pet/video/koalaScholar/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/koalaScholar/dying.mov'), webm: require('../../assets/pet/video/koalaScholar/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/koalaScholar/lie.mov'), webm: require('../../assets/pet/video/koalaScholar/lie.webm') },
});

const OTTER_LIFTER = gifFormSheet('otter', 'Otter · Lifter', require('../../assets/pet/otterLifter.png'), {
  idle: { hevc: require('../../assets/pet/video/otterLifter/idle-flex.mov'), webm: require('../../assets/pet/video/otterLifter/idle-flex.webm') },
  celebrating: { hevc: require('../../assets/pet/video/otterLifter/celebrating.mov'), webm: require('../../assets/pet/video/otterLifter/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/otterLifter/run.mov'), webm: require('../../assets/pet/video/otterLifter/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/otterLifter/dizzy.mov'), webm: require('../../assets/pet/video/otterLifter/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/otterLifter/sad.mov'), webm: require('../../assets/pet/video/otterLifter/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/otterLifter/dying.mov'), webm: require('../../assets/pet/video/otterLifter/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/otterLifter/lie.mov'), webm: require('../../assets/pet/video/otterLifter/lie.webm') },
}, OTTER_ART_SCALE);

const OTTER_RUNNER = gifFormSheet('otter', 'Otter · Runner', require('../../assets/pet/otterRunner.png'), {
  idle: { hevc: require('../../assets/pet/video/otterRunner/idle.mov'), webm: require('../../assets/pet/video/otterRunner/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/otterRunner/celebrating.mov'), webm: require('../../assets/pet/video/otterRunner/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/otterRunner/run.mov'), webm: require('../../assets/pet/video/otterRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/otterRunner/dizzy.mov'), webm: require('../../assets/pet/video/otterRunner/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/otterRunner/sad.mov'), webm: require('../../assets/pet/video/otterRunner/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/otterRunner/dying.mov'), webm: require('../../assets/pet/video/otterRunner/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/otterRunner/lie.mov'), webm: require('../../assets/pet/video/otterRunner/lie.webm') },
}, OTTER_ART_SCALE);

const OTTER_SCHOLAR = gifFormSheet('otter', 'Otter · Scholar', require('../../assets/pet/otterScholar.png'), {
  idle: { hevc: require('../../assets/pet/video/otterScholar/idle.mov'), webm: require('../../assets/pet/video/otterScholar/idle.webm') },
  celebrating: { hevc: require('../../assets/pet/video/otterScholar/celebrating.mov'), webm: require('../../assets/pet/video/otterScholar/celebrating.webm') },
  run: { hevc: require('../../assets/pet/video/otterScholar/run.mov'), webm: require('../../assets/pet/video/otterScholar/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/otterScholar/dizzy.mov'), webm: require('../../assets/pet/video/otterScholar/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/otterScholar/sad.mov'), webm: require('../../assets/pet/video/otterScholar/sad.webm') },
  dying: { hevc: require('../../assets/pet/video/otterScholar/dying.mov'), webm: require('../../assets/pet/video/otterScholar/dying.webm') },
  lie: { hevc: require('../../assets/pet/video/otterScholar/lie.mov'), webm: require('../../assets/pet/video/otterScholar/lie.webm') },
}, OTTER_ART_SCALE);

// ---------------------------------------------------------------------------
// Otter
// ---------------------------------------------------------------------------

/*
 * The otter, animated as GIFs like the bunny's forms: its clips play on iOS and
 * web, and its sheet is cut from the same clips by
 * `node scripts/buildVideoSheet.mjs otter` (which prints this frame map), in
 * the box `OTTER_CELL` gives the clips, so the two line up. 6fps throughout.
 *
 *   rows 0-2   sitting, blinking (12)    rows 8-9   lying flat, eyes shut (8)
 *   rows 3-5   jumps, arms up (12)       rows 10-11 dizzy, stars (6)
 *   rows 6-7   run, two strides (6)      rows 12-13 hunched and crying (8)
 *                                        rows 14-15 winces, drops, lies flat (8)
 */
const otterClip = (name: string, loop: boolean): PetVideoClip => ({ ...OTTER_CLIP_FILES[name]!, loop });
const OTTER_CLIP_FILES: Record<string, { hevc: number; webm: number }> = {
  idle: { hevc: require('../../assets/pet/video/otter/idle.mov'), webm: require('../../assets/pet/video/otter/idle.webm') },
  cheer: { hevc: require('../../assets/pet/video/otter/cheer.mov'), webm: require('../../assets/pet/video/otter/cheer.webm') },
  run: { hevc: require('../../assets/pet/video/otter/run.mov'), webm: require('../../assets/pet/video/otter/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/otter/dizzy.mov'), webm: require('../../assets/pet/video/otter/dizzy.webm') },
  cry: { hevc: require('../../assets/pet/video/otter/cry.mov'), webm: require('../../assets/pet/video/otter/cry.webm') },
  collapse: { hevc: require('../../assets/pet/video/otter/collapse.mov'), webm: require('../../assets/pet/video/otter/collapse.webm') },
  lie: { hevc: require('../../assets/pet/video/otter/lie.mov'), webm: require('../../assets/pet/video/otter/lie.webm') },
};

/** The box buildVideoSheet.mjs cuts the otter from, so a clip and its sheet frame line up. */
const OTTER_CELL = { x: 25, y: 15, size: 720 };

const OTTER: PetSheet = {
  name: 'otter',
  label: 'Otter',
  source: require('../../assets/pet/otter.png'),
  evolutions: { runner: OTTER_RUNNER, lifter: OTTER_LIFTER, scholar: OTTER_SCHOLAR },
  rows: 16,
  artScale: OTTER_ART_SCALE,
  animations: gifFormBands({ unwell: 6 }),
  // The dizzy art has its own spiral eyes and stars.
  selfDrawn: ['foggy'],
  frameMs: { idle: 333, cheer: 167, move: 167, rest: 333, unwell: 167, sad: 500, faint: 250 },
  videos: {
    frameSize: 768,
    cell: OTTER_CELL,
    clips: {
      idle: otterClip('idle', true),
      cheer: otterClip('cheer', true),
      // Whole strides and whole dizzy cycles, so neither loop stutters.
      move: otterClip('run', true),
      unwell: otterClip('dizzy', true),
      // Lying still, looped: the collapse's last frames, without the fall.
      rest: otterClip('lie', true),
      // Settle into a pose and stay there, rather than starting over.
      sad: otterClip('cry', false),
      faint: otterClip('collapse', false),
    },
    selfDrawn: ['foggy'],
  },
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
    // The happy band (rows 5-7: standing tall, mouth open), played there and
    // back so the loop never jumps. Rows 2-3 are a paw-lick, which read as a
    // grooming cut rather than joy.
    cheer: [[5, 0], [5, 1], [5, 2], [5, 3], [6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [6, 3], [6, 2], [6, 1], [6, 0], [5, 3], [5, 2], [5, 1]],
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

const TABBY_CAT: PetSheet = {
  ...sheetFrom(TABBY_CAT_LAYOUT, 'Tabby Cat', require('../../assets/pet/tabbyCat.png')),
  evolutions: { runner: TABBY_CAT_RUNNER, lifter: TABBY_CAT_LIFTER, scholar: TABBY_CAT_SCHOLAR },
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
    idle: [[0, 0], [0, 1], [0, 2], [0, 3],[0,3], [0,3], [0,3], [0,3], [0,3], [0,3], [0,1]],
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

/*
 * The bunny's three forms, animated as GIFs like the bear's: each has its own
 * clips and its own sheet, cut by `node scripts/buildVideoSheet.mjs <form>`
 * (which prints these frame maps) in one box shared by all three, chosen so
 * every form stands exactly the base bunny's size. 6fps throughout, so the
 * sheet bands are paced to the frames they were sampled from.
 */
const bunnyClip = (form: string, name: string): { hevc: number; webm: number } => BUNNY_CLIP_FILES[`${form}/${name}`]!;
const BUNNY_CLIP_FILES: Record<string, { hevc: number; webm: number }> = {
  'bunnyLifter/idle-flex': { hevc: require('../../assets/pet/video/bunnyLifter/idle-flex.mov'), webm: require('../../assets/pet/video/bunnyLifter/idle-flex.webm') },
  'bunnyLifter/cheer': { hevc: require('../../assets/pet/video/bunnyLifter/cheer.mov'), webm: require('../../assets/pet/video/bunnyLifter/cheer.webm') },
  'bunnyLifter/run': { hevc: require('../../assets/pet/video/bunnyLifter/run.mov'), webm: require('../../assets/pet/video/bunnyLifter/run.webm') },
  'bunnyLifter/dizzy': { hevc: require('../../assets/pet/video/bunnyLifter/dizzy.mov'), webm: require('../../assets/pet/video/bunnyLifter/dizzy.webm') },
  'bunnyLifter/sad': { hevc: require('../../assets/pet/video/bunnyLifter/sad.mov'), webm: require('../../assets/pet/video/bunnyLifter/sad.webm') },
  'bunnyLifter/collapse': { hevc: require('../../assets/pet/video/bunnyLifter/collapse.mov'), webm: require('../../assets/pet/video/bunnyLifter/collapse.webm') },
  'bunnyLifter/lie': { hevc: require('../../assets/pet/video/bunnyLifter/lie.mov'), webm: require('../../assets/pet/video/bunnyLifter/lie.webm') },
  'bunnyRunner/idle': { hevc: require('../../assets/pet/video/bunnyRunner/idle.mov'), webm: require('../../assets/pet/video/bunnyRunner/idle.webm') },
  'bunnyRunner/cheer': { hevc: require('../../assets/pet/video/bunnyRunner/cheer.mov'), webm: require('../../assets/pet/video/bunnyRunner/cheer.webm') },
  'bunnyRunner/run': { hevc: require('../../assets/pet/video/bunnyRunner/run.mov'), webm: require('../../assets/pet/video/bunnyRunner/run.webm') },
  'bunnyRunner/dizzy': { hevc: require('../../assets/pet/video/bunnyRunner/dizzy.mov'), webm: require('../../assets/pet/video/bunnyRunner/dizzy.webm') },
  'bunnyRunner/tired': { hevc: require('../../assets/pet/video/bunnyRunner/tired.mov'), webm: require('../../assets/pet/video/bunnyRunner/tired.webm') },
  'bunnyRunner/lie-down': { hevc: require('../../assets/pet/video/bunnyRunner/lie-down.mov'), webm: require('../../assets/pet/video/bunnyRunner/lie-down.webm') },
  'bunnyScholar/idle': { hevc: require('../../assets/pet/video/bunnyScholar/idle.mov'), webm: require('../../assets/pet/video/bunnyScholar/idle.webm') },
  'bunnyScholar/cheer': { hevc: require('../../assets/pet/video/bunnyScholar/cheer.mov'), webm: require('../../assets/pet/video/bunnyScholar/cheer.webm') },
  'bunnyScholar/walk': { hevc: require('../../assets/pet/video/bunnyScholar/walk.mov'), webm: require('../../assets/pet/video/bunnyScholar/walk.webm') },
  'bunnyScholar/dizzy': { hevc: require('../../assets/pet/video/bunnyScholar/dizzy.mov'), webm: require('../../assets/pet/video/bunnyScholar/dizzy.webm') },
  'bunnyScholar/cry': { hevc: require('../../assets/pet/video/bunnyScholar/cry.mov'), webm: require('../../assets/pet/video/bunnyScholar/cry.webm') },
  'bunnyScholar/collapse': { hevc: require('../../assets/pet/video/bunnyScholar/collapse.mov'), webm: require('../../assets/pet/video/bunnyScholar/collapse.webm') },
};

/** The box buildVideoSheet.mjs cuts every bunny form from, so a clip and its sheet frame line up. */
const BUNNY_FORM_CELL = { x: 52, y: 58, size: 672 };

/** The same seven bands in the same rows for all three forms (the scholar's walk takes an extra row). */
const bunnyFormBands = (moveCells: [number, number][], after: number): PetSheet['animations'] => {
  const band = (row: number, count: number): [number, number][] =>
    Array.from({ length: count }, (_, i) => [row + Math.floor(i / 4), i % 4] as [number, number]);
  return {
    idle: band(0, 12),
    cheer: band(3, 12),
    move: moveCells,
    rest: band(after, 8),
    unwell: band(after + 2, 8),
    sad: band(after + 4, 8),
    // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
    faint: band(after + 6, 8),
  };
};

/**
 * Bunny · Lifter, 4x16: red headband. Stands about, then rears up into a
 * double-bicep flex (the idle clip), jumps and pumps a fist (cheer), hops
 * (move), lies flat (rest), dizzy, ears down crying (sad), winces and drops
 * (faint).
 */
const BUNNY_LIFTER: PetSheet = {
  name: 'bunny',
  label: 'Bunny · Lifter',
  source: require('../../assets/pet/bunnyLifter.png'),
  rows: 16,
  animations: bunnyFormBands([[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1], [7, 2], [7, 3]], 8),
  selfDrawn: ['foggy'],
  frameMs: { idle: 400, cheer: 167, move: 375, rest: 333, unwell: 500, sad: 500, faint: 250 },
  videos: {
    frameSize: 768,
    cell: BUNNY_FORM_CELL,
    clips: {
      idle: { ...bunnyClip('bunnyLifter', 'idle-flex'), loop: true },
      cheer: { ...bunnyClip('bunnyLifter', 'cheer'), loop: true },
      // One whole 18-frame hop, so the loop never stutters.
      move: { ...bunnyClip('bunnyLifter', 'run'), loop: true },
      unwell: { ...bunnyClip('bunnyLifter', 'dizzy'), loop: true },
      // Lying still, looped: the collapse's last frames, without the fall.
      rest: { ...bunnyClip('bunnyLifter', 'lie'), loop: true },
      // Settle into a pose and stay there, rather than starting over.
      sad: { ...bunnyClip('bunnyLifter', 'sad'), loop: false },
      faint: { ...bunnyClip('bunnyLifter', 'collapse'), loop: false },
    },
    // The dizzy clip has its own spiral eyes and ring of stars.
    selfDrawn: ['foggy'],
  },
};

/** Bunny · Runner, 4x16: orange headband and a gold medal. Its run is a quick three-frame hop. */
const BUNNY_RUNNER: PetSheet = {
  name: 'bunny',
  label: 'Bunny · Runner',
  source: require('../../assets/pet/bunnyRunner.png'),
  rows: 16,
  animations: bunnyFormBands([[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1]], 8),
  selfDrawn: ['foggy'],
  frameMs: { idle: 333, cheer: 167, move: 167, rest: 333, unwell: 500, sad: 500, faint: 250 },
  videos: {
    frameSize: 768,
    cell: BUNNY_FORM_CELL,
    clips: {
      idle: { ...bunnyClip('bunnyRunner', 'idle'), loop: true },
      cheer: { ...bunnyClip('bunnyRunner', 'cheer'), loop: true },
      move: { ...bunnyClip('bunnyRunner', 'run'), loop: true },
      unwell: { ...bunnyClip('bunnyRunner', 'dizzy'), loop: true },
      // Settle into a pose and stay there, rather than starting over.
      sad: { ...bunnyClip('bunnyRunner', 'tired'), loop: false },
      rest: { ...bunnyClip('bunnyRunner', 'lie-down'), loop: false },
      faint: { ...bunnyClip('bunnyRunner', 'lie-down'), loop: false },
    },
    selfDrawn: ['foggy'],
  },
};

/** Bunny · Scholar, 4x17: carries a red book with a gold star. Its walk takes an extra row. */
const BUNNY_SCHOLAR: PetSheet = {
  name: 'bunny',
  label: 'Bunny · Scholar',
  source: require('../../assets/pet/bunnyScholar.png'),
  rows: 17,
  animations: bunnyFormBands([[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1], [7, 2], [7, 3], [8, 0], [8, 1]], 9),
  selfDrawn: ['foggy'],
  frameMs: { idle: 333, cheer: 167, move: 167, rest: 333, unwell: 500, sad: 500, faint: 250 },
  videos: {
    frameSize: 768,
    cell: BUNNY_FORM_CELL,
    clips: {
      idle: { ...bunnyClip('bunnyScholar', 'idle'), loop: true },
      cheer: { ...bunnyClip('bunnyScholar', 'cheer'), loop: true },
      move: { ...bunnyClip('bunnyScholar', 'walk'), loop: true },
      unwell: { ...bunnyClip('bunnyScholar', 'dizzy'), loop: true },
      sad: { ...bunnyClip('bunnyScholar', 'cry'), loop: false },
      faint: { ...bunnyClip('bunnyScholar', 'collapse'), loop: false },
      // No sleeping clip: `rest` lies flat on the sheet's after-the-fall frames.
    },
    selfDrawn: ['foggy'],
  },
};

const BUNNY: PetSheet = {
  ...sheetFrom(BUNNY_LAYOUT, 'Bunny', require('../../assets/pet/bunny.png')),
  evolutions: { runner: BUNNY_RUNNER, lifter: BUNNY_LIFTER, scholar: BUNNY_SCHOLAR },
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
    idle: [[0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [0, 0], [0, 1], [0, 2], [1,0], [1,1], [1,2], [1,3], [2,0], [1,0]],
    // Eyes shut and clearly pleased — the closest this sheet has to celebrating.
    cheer: [[3, 0], [3, 1], [3, 2], [3, 3]],
    move: [[3, 0], [3, 1], [3, 2], [3, 3]],
    rest: [[7, 0], [7, 1], [7, 2], [7, 3]],
    unwell: [[4, 0], [4, 1], [4, 2], [4, 3]],
    sad: [[4, 0], [4, 1], [4, 2], [4, 3]],
    faint: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0]],
  },
};

const FOX: PetSheet = {
  ...sheetFrom(FOX_LAYOUT, 'Fox', require('../../assets/pet/fox.png')),
  evolutions: { runner: FOX_RUNNER, lifter: FOX_LIFTER, scholar: FOX_SCHOLAR },
};

/**
 * Koala, 4x10.
 *
 *   rows 0-1  sitting idle (5)        rows 6-7  sitting, downcast (6)
 *   rows 2-3  sitting → open-mouthed  row  8    slumps down (4)
 *             delight (6)             row  9    down, orbiting stars (3)
 *   rows 4-5  walking (5)
 *
 * Rows 4-5 read as "arms up, delighted" at thumbnail size, which is how they
 * were first mapped; at full size the limbs are plainly alternating and the body
 * leans into each step. It is the walk, and the sitting band above it is the
 * celebration.
 */
const KOALA_LAYOUT: SheetLayout = {
  name: 'koala',
  rows: 10,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
    // Ends on the two open-mouthed frames, which is where the delight lands.
    cheer: [[2, 0], [2, 1], [2, 2], [2, 3], [3, 0], [3, 1]],
    move: [[4, 0], [4, 1], [4, 2], [4, 3], [5, 0]],
    // No sleep art, so `rest` borrows the calmest sit the sheet owns.
    rest: [[2, 0]],
    unwell: [[6, 0], [6, 1], [6, 2], [6, 3]],
    sad: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1]],
    // The last row draws its own orbiting stars, but only lying down, so it ends
    // `faint` rather than standing in for `unwell` — `selfDrawn` stays unset.
    faint: [[8, 0], [8, 1], [8, 2], [8, 3], [9, 0]],
  },
};

const KOALA: PetSheet = {
  ...sheetFrom(KOALA_LAYOUT, 'Koala', require('../../assets/pet/koala.png')),
  evolutions: { runner: KOALA_RUNNER, lifter: KOALA_LIFTER, scholar: KOALA_SCHOLAR },
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
    idle: [[0, 0], [0, 1], [0,1], [0,1], [0,1], [0,1], [0,1], [0, 2], [0, 3]],
    // Face in the honey pot: this sheet's happiest frames by a distance.
    cheer: [[1, 0], [1,0], [1, 1], [1,1], [1, 2], [1,2], [1, 3], [1,3], [2, 0]],
    move: [[3, 0], [3, 1], [3, 2], [3, 3]],
    rest: [[4, 0]],
    unwell: [[4, 0], [4, 1], [4, 2], [4, 3]],
    sad: [[5, 0], [5, 1], [5, 2]],
    // Drawn as a fade rather than a collapse -- the last cells are the same bear
    // at falling alpha, so the order matters and the faintest must come last.
    faint: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0]],
  },
};

/**
 * Bear · Lifter, 4x17. Its own sheet and its own map: this form was animated
 * separately rather than derived from the base bear art, so sharing
 * BEAR_LAYOUT would play the walk cycle as a cheer and the yawn as a stroll.
 * Cut from four clips by scripts/buildVideoSheet.mjs, which prints this
 * frame map when it runs -- check the two against each other after any change.
 *
 * The flex is the whole point of the strength build, so it is `cheer`: the band
 * the app plays on a level-up or a new personal record.
 *
 *   rows 0-2   standing idle (12)    rows 11-12  yawning (8)
 *   rows 3-5   rears into a flex     rows 13-14  sitting, subdued (8)
 *              and holds it (12)     rows 15-16  curled up on the floor (8)
 *   rows 6-8   walk cycle (12)
 *   rows 9-10  sitting with the honey pot (8)
 */
/**
 * Four clips for seven bands: `unwell`, `sad` and `faint` have no video and
 * fall back to the sheet's yawning, sitting and curled-up frames, which is what
 * `clips` being partial is for. Android falls back for all of them.
 */
const bearLifterClip = (name: string) => ({
  hevc: BEAR_LIFTER_FILES[name]!.hevc,
  webm: BEAR_LIFTER_FILES[name]!.webm,
});
const BEAR_LIFTER_FILES: Record<string, { hevc: number; webm: number }> = {
  'idle-flex': { hevc: require('../../assets/pet/video/bearLifter/idle-flex.mov'), webm: require('../../assets/pet/video/bearLifter/idle-flex.webm') },
  cheer: { hevc: require('../../assets/pet/video/bearLifter/cheer.mov'), webm: require('../../assets/pet/video/bearLifter/cheer.webm') },
  run: { hevc: require('../../assets/pet/video/bearLifter/run.mov'), webm: require('../../assets/pet/video/bearLifter/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/bearLifter/dizzy.mov'), webm: require('../../assets/pet/video/bearLifter/dizzy.webm') },
  sad: { hevc: require('../../assets/pet/video/bearLifter/sad.mov'), webm: require('../../assets/pet/video/bearLifter/sad.webm') },
  collapse: { hevc: require('../../assets/pet/video/bearLifter/collapse.mov'), webm: require('../../assets/pet/video/bearLifter/collapse.webm') },
  lie: { hevc: require('../../assets/pet/video/bearLifter/lie.mov'), webm: require('../../assets/pet/video/bearLifter/lie.webm') },
};

const BEAR_LIFTER_VIDEOS: PetVideos = {
  frameSize: 768,
  // The same box scripts/buildVideoSheet.mjs cuts its cells from, so a
  // band with no clip falls back to the sheet without the bear moving.
  cell: { x: 26, y: 4, size: 720 },
  clips: {
    // Stands about, then rears up into a double-bicep flex — the strength
    // build's whole personality, so it is what you see most of the time.
    idle: { ...bearLifterClip('idle-flex'), loop: true },
    // Hugs the honey pot and pumps a fist.
    cheer: { ...bearLifterClip('cheer'), loop: true },
    // Three whole strides, so the loop never stutters.
    move: { ...bearLifterClip('run'), loop: true },
    unwell: { ...bearLifterClip('dizzy'), loop: true },
    // Lying still, looped: the collapse's last frames, without the fall.
    rest: { ...bearLifterClip('lie'), loop: true },
    // These two settle into a pose and stay there. Looping them would have
    // the bear stand back up and slump, or fall, over and over.
    sad: { ...bearLifterClip('sad'), loop: false },
    faint: { ...bearLifterClip('collapse'), loop: false },
  },
  // The dizzy clip has its own spiral eyes and orbiting stars.
  selfDrawn: ['foggy'],
};

const BEAR_LIFTER: PetSheet = {
  // Still the bear breed -- `name` identifies the animal, not the sheet.
  name: 'bear',
  label: 'Bear · Lifter',
  source: require('../../assets/pet/bearLifter.png'),
  rows: 16,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3]],
    cheer: [[3, 0], [3, 1], [3, 2], [3, 3], [4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 1], [5, 2], [5, 3]],
    // One whole 8-frame stride of the run, so it loops.
    move: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1], [7, 2], [7, 3]],
    rest: [[8, 0], [8, 1], [8, 2], [8, 3], [9, 0], [9, 1], [9, 2], [9, 3]],
    unwell: [[10, 0], [10, 1], [10, 2], [10, 3], [11, 0], [11, 1], [11, 2], [11, 3]],
    sad: [[12, 0], [12, 1], [12, 2], [12, 3], [13, 0], [13, 1], [13, 2], [13, 3]],
    faint: [[14, 0], [14, 1], [14, 2], [14, 3], [15, 0], [15, 1], [15, 2], [15, 3]],
  },
  // `rest` is a real loop here rather than the single frame most sheets hold,
  // so the shared 700ms would crawl; `cheer` is paced to the clip it came from.
  // The dizzy band draws its own spiral eyes and stars.
  selfDrawn: ['foggy'],
  frameMs: { cheer: 150, rest: 250 },
  videos: BEAR_LIFTER_VIDEOS,
};

/**
 * Bear · Runner, 4x16: the bear in a headband with a gold medal round its neck.
 * Animated as video like the lifter, so it too has its own sheet and map, cut
 * from the clips by `node scripts/buildVideoSheet.mjs bearRunner` (which prints
 * this frame map), and framed to the same share of its cell as the base bear so
 * evolving does not resize it.
 *
 *   rows 0-2   standing, blinking (12)   rows 10-11  dizzy, ring of stars (8)
 *   rows 3-5   medal held up, cheering   rows 12-13  slumped, hunched (8)
 *              (12)                      rows 14-15  sits, then lies down (8)
 *   rows 6-7   run cycle (8)
 *   rows 8-9   lying on the floor (8)
 */
const BEAR_RUNNER_CLIPS = {
  idle: { hevc: require('../../assets/pet/video/bearRunner/idle.mov'), webm: require('../../assets/pet/video/bearRunner/idle.webm') },
  cheer: { hevc: require('../../assets/pet/video/bearRunner/cheer.mov'), webm: require('../../assets/pet/video/bearRunner/cheer.webm') },
  run: { hevc: require('../../assets/pet/video/bearRunner/run.mov'), webm: require('../../assets/pet/video/bearRunner/run.webm') },
  dizzy: { hevc: require('../../assets/pet/video/bearRunner/dizzy.mov'), webm: require('../../assets/pet/video/bearRunner/dizzy.webm') },
  tired: { hevc: require('../../assets/pet/video/bearRunner/tired.mov'), webm: require('../../assets/pet/video/bearRunner/tired.webm') },
  'lie-down': { hevc: require('../../assets/pet/video/bearRunner/lie-down.mov'), webm: require('../../assets/pet/video/bearRunner/lie-down.webm') },
};

const BEAR_RUNNER_VIDEOS: PetVideos = {
  frameSize: 768,
  // The box scripts/buildVideoSheet.mjs cuts the cells from. It hangs 24px
  // above the frame so the bear stands half a cell tall, like the base bear.
  cell: { x: 8, y: -24, size: 754 },
  clips: {
    idle: { ...BEAR_RUNNER_CLIPS.idle, loop: true },
    cheer: { ...BEAR_RUNNER_CLIPS.cheer, loop: true },
    move: { ...BEAR_RUNNER_CLIPS.run, loop: true },
    unwell: { ...BEAR_RUNNER_CLIPS.dizzy, loop: true },
    // These three settle into a pose and stay there. Looping them would have
    // the bear stand back up and slump, or lie down, over and over.
    sad: { ...BEAR_RUNNER_CLIPS.tired, loop: false },
    rest: { ...BEAR_RUNNER_CLIPS['lie-down'], loop: false },
    faint: { ...BEAR_RUNNER_CLIPS['lie-down'], loop: false },
  },
  // The dizzy clip has its own spiral eyes and orbiting stars.
  selfDrawn: ['foggy'],
};

const BEAR_RUNNER: PetSheet = {
  name: 'bear',
  label: 'Bear · Runner',
  source: require('../../assets/pet/bearRunner.png'),
  rows: 16,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3]],
    cheer: [[3, 0], [3, 1], [3, 2], [3, 3], [4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 1], [5, 2], [5, 3]],
    // Eight frames across one 16-frame cycle of the source clip, so it loops.
    move: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1], [7, 2], [7, 3]],
    rest: [[8, 0], [8, 1], [8, 2], [8, 3], [9, 0], [9, 1], [9, 2], [9, 3]],
    unwell: [[10, 0], [10, 1], [10, 2], [10, 3], [11, 0], [11, 1], [11, 2], [11, 3]],
    sad: [[12, 0], [12, 1], [12, 2], [12, 3], [13, 0], [13, 1], [13, 2], [13, 3]],
    // Ends lying still, the frame HOLDS_LAST_FRAME parks on.
    faint: [[14, 0], [14, 1], [14, 2], [14, 3], [15, 0], [15, 1], [15, 2], [15, 3]],
  },
  // Its dizzy band draws its own stars, like the clip.
  selfDrawn: ['foggy'],
  // Paced to the 6fps GIFs each band was sampled from, so the sheet plays at
  // the speed they were drawn.
  frameMs: { idle: 400, cheer: 375, move: 333, rest: 250, unwell: 500, sad: 500 },
  videos: BEAR_RUNNER_VIDEOS,
};

/**
 * Bear · Scholar, 4x16: the bear with a first-place rosette and a rolled-up
 * diploma. Animated as GIFs, cut into this sheet by `node scripts/buildVideoSheet.mjs
 * bearScholar` (which prints this frame map), framed in the runner's box so the
 * three bear forms stand the same size.
 *
 *   rows 0-2   standing, blinking (12)      rows 10-11  dizzy, ring of stars (8)
 *   rows 3-5   diploma held up (12)         rows 12-13  slumps and cries (8)
 *   rows 6-7   walk cycle (8)               rows 14-15  drops its scroll and
 *   rows 8-9   dozing on its feet (8)                   falls flat, X eyes (8)
 */
const BEAR_SCHOLAR_CLIPS = {
  idle: { hevc: require('../../assets/pet/video/bearScholar/idle.mov'), webm: require('../../assets/pet/video/bearScholar/idle.webm') },
  cheer: { hevc: require('../../assets/pet/video/bearScholar/cheer.mov'), webm: require('../../assets/pet/video/bearScholar/cheer.webm') },
  walk: { hevc: require('../../assets/pet/video/bearScholar/walk.mov'), webm: require('../../assets/pet/video/bearScholar/walk.webm') },
  dizzy: { hevc: require('../../assets/pet/video/bearScholar/dizzy.mov'), webm: require('../../assets/pet/video/bearScholar/dizzy.webm') },
  cry: { hevc: require('../../assets/pet/video/bearScholar/cry.mov'), webm: require('../../assets/pet/video/bearScholar/cry.webm') },
  collapse: { hevc: require('../../assets/pet/video/bearScholar/collapse.mov'), webm: require('../../assets/pet/video/bearScholar/collapse.webm') },
};

const BEAR_SCHOLAR_VIDEOS: PetVideos = {
  frameSize: 768,
  // The runner's box, which scripts/buildVideoSheet.mjs also cuts this sheet from.
  cell: { x: 8, y: -24, size: 754 },
  clips: {
    idle: { ...BEAR_SCHOLAR_CLIPS.idle, loop: true },
    cheer: { ...BEAR_SCHOLAR_CLIPS.cheer, loop: true },
    move: { ...BEAR_SCHOLAR_CLIPS.walk, loop: true },
    unwell: { ...BEAR_SCHOLAR_CLIPS.dizzy, loop: true },
    // Settle into a pose and stay there, rather than starting over on a loop.
    sad: { ...BEAR_SCHOLAR_CLIPS.cry, loop: false },
    faint: { ...BEAR_SCHOLAR_CLIPS.collapse, loop: false },
    // No sleeping clip: `rest` dozes on the sheet's eyes-closed frames.
  },
  selfDrawn: ['foggy'],
};

const BEAR_SCHOLAR: PetSheet = {
  name: 'bear',
  label: 'Bear · Scholar',
  source: require('../../assets/pet/bearScholar.png'),
  rows: 16,
  animations: {
    idle: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3]],
    cheer: [[3, 0], [3, 1], [3, 2], [3, 3], [4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 1], [5, 2], [5, 3]],
    // Eight frames across one 16-frame cycle of the walk, so it loops.
    move: [[6, 0], [6, 1], [6, 2], [6, 3], [7, 0], [7, 1], [7, 2], [7, 3]],
    // Dozing on its feet, eyes closed -- also what `exhausted` plays.
    rest: [[8, 0], [8, 1], [8, 2], [8, 3], [9, 0], [9, 1], [9, 2], [9, 3]],
    unwell: [[10, 0], [10, 1], [10, 2], [10, 3], [11, 0], [11, 1], [11, 2], [11, 3]],
    sad: [[12, 0], [12, 1], [12, 2], [12, 3], [13, 0], [13, 1], [13, 2], [13, 3]],
    // Ends flat out, the frame HOLDS_LAST_FRAME parks on.
    faint: [[14, 0], [14, 1], [14, 2], [14, 3], [15, 0], [15, 1], [15, 2], [15, 3]],
  },
  // Its dizzy band draws its own stars, like the clip.
  selfDrawn: ['foggy'],
  // Paced to the 6fps GIFs each band was sampled from.
  frameMs: { idle: 400, cheer: 170, move: 333, rest: 400, unwell: 500, sad: 500, faint: 250 },
  videos: BEAR_SCHOLAR_VIDEOS,
};

const BEAR: PetSheet = {
  ...sheetFrom(BEAR_LAYOUT, 'Bear', require('../../assets/pet/bear.png')),
  evolutions: { runner: BEAR_RUNNER, lifter: BEAR_LIFTER, scholar: BEAR_SCHOLAR },
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
    idle: [[0, 0], [0,0], [0,0], [0,0], [0,0], [0, 1], [0, 2], [0, 3],[0,2],[0,1]],
    cheer: [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2]],
    move: [[3, 0], [3, 1], [3, 2], [3, 3], [4, 0]],
    rest: [[5, 0]],
    unwell: [[7, 0], [7, 1], [7, 2], [7, 3]],
    sad: [[5, 0], [5, 1], [5, 2], [5, 3], [6, 0], [6, 1]],
    faint: [[8, 0], [8, 1], [8, 2]],
  },
};

/*
 * The axolotl's three forms, animated as GIFs like the bunny's: each has its
 * own clips and a sheet cut from them by `node scripts/buildVideoSheet.mjs
 * <form>`, in one box shared by all three (`AXOLOTL_FORM_CELL`) so every form
 * stands the base axolotl's size. 6fps throughout.
 */
const AXOLOTL_FORM_CELL = { x: 87, y: 72, size: 594 };
const AXOLOTL_FORM_TIMING: PetSheet['frameMs'] = { idle: 333, cheer: 167, move: 167, rest: 333, unwell: 500, sad: 500, faint: 250 };

/** Axolotl · Lifter: red headband. Stands about, then flexes (idle); hops (move). */
const AXOLOTL_LIFTER: PetSheet = {
  name: 'axolotl',
  label: 'Axolotl · Lifter',
  source: require('../../assets/pet/axolotlLifter.png'),
  rows: 16,
  animations: gifFormBands({ unwell: 8 }),
  selfDrawn: ['foggy'],
  frameMs: AXOLOTL_FORM_TIMING,
  videos: {
    frameSize: 768,
    cell: AXOLOTL_FORM_CELL,
    clips: {
      idle: { hevc: require('../../assets/pet/video/axolotlLifter/idle-flex.mov'), webm: require('../../assets/pet/video/axolotlLifter/idle-flex.webm'), loop: true },
      cheer: { hevc: require('../../assets/pet/video/axolotlLifter/cheer.mov'), webm: require('../../assets/pet/video/axolotlLifter/cheer.webm'), loop: true },
      move: { hevc: require('../../assets/pet/video/axolotlLifter/run.mov'), webm: require('../../assets/pet/video/axolotlLifter/run.webm'), loop: true },
      unwell: { hevc: require('../../assets/pet/video/axolotlLifter/dizzy.mov'), webm: require('../../assets/pet/video/axolotlLifter/dizzy.webm'), loop: true },
      rest: { hevc: require('../../assets/pet/video/axolotlLifter/lie.mov'), webm: require('../../assets/pet/video/axolotlLifter/lie.webm'), loop: true },
      sad: { hevc: require('../../assets/pet/video/axolotlLifter/sad.mov'), webm: require('../../assets/pet/video/axolotlLifter/sad.webm'), loop: false },
      faint: { hevc: require('../../assets/pet/video/axolotlLifter/collapse.mov'), webm: require('../../assets/pet/video/axolotlLifter/collapse.webm'), loop: false },
    },
    // The dizzy clip has its own spiral eyes and ring of stars.
    selfDrawn: ['foggy'],
  },
};

/** Axolotl · Runner: orange headband and a gold medal. */
const AXOLOTL_RUNNER: PetSheet = {
  name: 'axolotl',
  label: 'Axolotl · Runner',
  source: require('../../assets/pet/axolotlRunner.png'),
  rows: 16,
  animations: gifFormBands({ unwell: 8 }),
  selfDrawn: ['foggy'],
  frameMs: AXOLOTL_FORM_TIMING,
  videos: {
    frameSize: 768,
    cell: AXOLOTL_FORM_CELL,
    clips: {
      idle: { hevc: require('../../assets/pet/video/axolotlRunner/idle.mov'), webm: require('../../assets/pet/video/axolotlRunner/idle.webm'), loop: true },
      cheer: { hevc: require('../../assets/pet/video/axolotlRunner/cheer.mov'), webm: require('../../assets/pet/video/axolotlRunner/cheer.webm'), loop: true },
      move: { hevc: require('../../assets/pet/video/axolotlRunner/run.mov'), webm: require('../../assets/pet/video/axolotlRunner/run.webm'), loop: true },
      unwell: { hevc: require('../../assets/pet/video/axolotlRunner/dizzy.mov'), webm: require('../../assets/pet/video/axolotlRunner/dizzy.webm'), loop: true },
      rest: { hevc: require('../../assets/pet/video/axolotlRunner/lie.mov'), webm: require('../../assets/pet/video/axolotlRunner/lie.webm'), loop: true },
      sad: { hevc: require('../../assets/pet/video/axolotlRunner/tired.mov'), webm: require('../../assets/pet/video/axolotlRunner/tired.webm'), loop: false },
      faint: { hevc: require('../../assets/pet/video/axolotlRunner/lie-down.mov'), webm: require('../../assets/pet/video/axolotlRunner/lie-down.webm'), loop: false },
    },
    selfDrawn: ['foggy'],
  },
};

/** Axolotl · Scholar: carries a red book with a gold star; walks rather than runs. */
const AXOLOTL_SCHOLAR: PetSheet = {
  name: 'axolotl',
  label: 'Axolotl · Scholar',
  source: require('../../assets/pet/axolotlScholar.png'),
  rows: 16,
  animations: gifFormBands({ unwell: 8 }),
  selfDrawn: ['foggy'],
  frameMs: AXOLOTL_FORM_TIMING,
  videos: {
    frameSize: 768,
    cell: AXOLOTL_FORM_CELL,
    clips: {
      idle: { hevc: require('../../assets/pet/video/axolotlScholar/idle.mov'), webm: require('../../assets/pet/video/axolotlScholar/idle.webm'), loop: true },
      cheer: { hevc: require('../../assets/pet/video/axolotlScholar/cheer.mov'), webm: require('../../assets/pet/video/axolotlScholar/cheer.webm'), loop: true },
      move: { hevc: require('../../assets/pet/video/axolotlScholar/walk.mov'), webm: require('../../assets/pet/video/axolotlScholar/walk.webm'), loop: true },
      unwell: { hevc: require('../../assets/pet/video/axolotlScholar/dizzy.mov'), webm: require('../../assets/pet/video/axolotlScholar/dizzy.webm'), loop: true },
      rest: { hevc: require('../../assets/pet/video/axolotlScholar/lie.mov'), webm: require('../../assets/pet/video/axolotlScholar/lie.webm'), loop: true },
      sad: { hevc: require('../../assets/pet/video/axolotlScholar/cry.mov'), webm: require('../../assets/pet/video/axolotlScholar/cry.webm'), loop: false },
      faint: { hevc: require('../../assets/pet/video/axolotlScholar/collapse.mov'), webm: require('../../assets/pet/video/axolotlScholar/collapse.webm'), loop: false },
    },
    selfDrawn: ['foggy'],
  },
};

const AXOLOTL: PetSheet = {
  ...sheetFrom(AXOLOTL_LAYOUT, 'Axolotl', require('../../assets/pet/axolotl.png')),
  evolutions: { runner: AXOLOTL_RUNNER, lifter: AXOLOTL_LIFTER, scholar: AXOLOTL_SCHOLAR },
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
    idle: [[0, 0], [0,0], [0, 0], [0,0], [0, 0], [0,0], [0, 0], [0,0], [0, 1], [0, 2], [0, 3]],
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

const DINO: PetSheet = {
  ...sheetFrom(DINO_LAYOUT, 'Dino', require('../../assets/pet/dino.png')),
  evolutions: { runner: DINO_RUNNER, lifter: DINO_LIFTER, scholar: DINO_SCHOLAR },
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
 * The frame a pet is shown in when it is not animating (pickers, avatars, the
 * share card, notifications): eyes open, looking out. Several idle cycles open
 * mid-blink, which reads as asleep on a still, so `idle[0]` will not do.
 * Picked by eye from each sheet's idle row; a sheet not listed (the evolved
 * forms) falls back to its first idle frame.
 */
const PORTRAIT: Partial<Record<string, Frame>> = {
  bichon: [0, 2],
  shiba: [0, 2],
  otter: [0, 0],
  tabbyCat: [0, 0],
  bunny: [0, 2],
  fox: [0, 0],
  koala: [0, 2],
  bear: [0, 2],
  axolotl: [0, 0],
  dino: [0, 1],
};

export const portraitFrame = (sheet: PetSheet): Frame => PORTRAIT[sheet.name] ?? sheet.animations.idle[0]!;

/**
 * The sheet a pet is drawn from, evolutions included.
 *
 * `level`, `endurance`, `strength` and `mind` are optional so the still previews
 * in the breed picker can ask for a breed's base look without inventing a pet: a
 * partial pet has no level, reads as `baby`, and so never resolves to an evolved
 * form.
 */
export const sheetForPet = (
  pet: Pick<PetState, 'id' | 'breed'> &
    Partial<Pick<PetState, 'level' | 'endurance' | 'strength' | 'mindSessions' | 'evolvedBuild' | 'earnedBuilds' | 'chosenBuild'>>,
): PetSheet => {
  const base = baseSheetForPet(pet);
  // Gated on level as well as build: a level-2 pet that has been walked a lot has
  // not been raised long enough for how it was raised to mean anything yet.
  if ((pet.level ?? 1) < EVOLUTION_LEVEL) return base;
  const build = getPetBuild({
    endurance: pet.endurance ?? 0,
    strength: pet.strength ?? 0,
    mindSessions: pet.mindSessions ?? 0,
    evolvedBuild: pet.evolvedBuild,
    earnedBuilds: pet.earnedBuilds,
    chosenBuild: pet.chosenBuild,
  });
  return base.evolutions?.[build] ?? base;
};

/** A breed's sheet for one particular evolution, whether or not the pet has it (the teaser silhouettes). */
export const evolutionSheetFor = (pet: Pick<PetState, 'id' | 'breed'>, build: PetBuild): PetSheet => {
  const base = baseSheetForPet(pet);
  return build === 'balanced' ? base : base.evolutions?.[build] ?? base;
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
