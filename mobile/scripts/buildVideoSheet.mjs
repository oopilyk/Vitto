/**
 * Builds a pet form's sprite sheet from the source videos it was animated as.
 *
 *   node scripts/buildVideoSheet.mjs <bearLifter | bearRunner | bearScholar | bunnyLifter | bunnyRunner | bunnyScholar | otter | bichonRunner | shibaRunner>
 *
 * The forms animated as video still need a sheet: `SpriteFrame` works by
 * sliding one PNG behind a 128px window, and everything built on it -- the tint
 * wash for ailments, `artScale`, the floor anchoring, Android (which plays no
 * clips), the Dynamic Island, the share card -- reads that sheet. So frames are
 * cut out and laid into the same 4-column grid every other pet uses, and
 * nothing downstream has to know where they came from.
 *
 * Two things make the result line up with the hand-drawn sheets:
 *
 *   * ONE transform for every frame. The crop and scale are fixed per form,
 *     never measured per frame, so the pet does not jitter from cell to cell.
 *     Its own motion survives; the anchor does not move.
 *   * The box is chosen so the art fills the share of its cell the base sheet's
 *     does (half the cell tall, feet ~83% down), so evolving does not resize
 *     the pet.
 *
 * The background is keyed by flooding inward from the border (keyBackground.mjs),
 * so white INSIDE the art (the eye glints, the medal's shine) survives.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { fillBehindGaps, fillHoles, keyBackground } from './keyBackground.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pets = path.join(root, 'assets/pet');

const CELL = 128;
const COLUMNS = 4;

/**
 * Per form:
 *
 *   source  folder under assets/source/video/ holding its clips (input, not
 *           app assets)
 *   box     the square of the 768px video frame that becomes one 128px cell.
 *           THE SAME BOX the form's `videos.cell` gives PetVideo in
 *           petSprites.ts: on iOS and web the clips play instead of these
 *           frames, so if the two framed the pet differently it would jump the
 *           moment an animation had no clip and fell back to the sheet. It may
 *           hang past the frame's edge; that part of the cell stays empty.
 *   band    where each animation's frames come from: [clip, frame indices].
 *           Twelve frames for the bands the eye follows, eight for the rest.
 */
const FORMS = {
  bearLifter: {
    source: 'bear-lifter',
    output: 'bearLifter.png',
    // The bear stands with its feet at y≈600 and is centred on x≈386, which
    // this box puts at y=106 and x=64 of the cell.
    box: { x: 26, y: 4, size: 720 },
    key: { tolerance: 18, pocketArea: 200, pocketReach: 10, greyFringe: true },
    // As in buildLifterVideos.mjs: only the dizzy GIF has white behind its art.
    cutOutPockets: ['dizzy'],
    fillHoles: { clips: ['cheer', 'collapse'], maxArea: 200 },
    /*
     * idle-flex.mp4, 124 frames at 24fps: 0-56 standing, 60-104 rises into a flex.
     * The rest are GIFs, 31 frames at 6fps, already cut out; frame 0 of each is
     * a stray frame of the old pose and is never used:
     *   cheer.gif     holds the honey pot, 9-20 pumps a fist
     *   run.gif       ONE STRIDE IS 8 FRAMES (1 matches 9, 17, 25)
     *   dizzy.gif     spiral eyes, a ring of stars from frame 2
     *   sad.gif       1-5 slumps, 6+ hunched and crying
     *   collapse.gif  1-16 grumpy, 17-18 goes down, 19+ lies flat
     */
    band: {
      idle: ['idle-flex', [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]],
      cheer: ['cheer', [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]],
      move: ['run', [9, 10, 11, 12, 13, 14, 15, 16]],
      rest: ['collapse', [19, 20, 22, 24, 26, 27, 28, 30]],
      unwell: ['dizzy', [3, 6, 9, 12, 15, 18, 21, 24]],
      sad: ['sad', [6, 9, 12, 15, 18, 21, 24, 27]],
      // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
      faint: ['collapse', [1, 5, 9, 13, 16, 17, 18, 19]],
    },
  },
  bearRunner: {
    source: 'bear-runner',
    output: 'bearRunner.png',
    // Idle stands 377px tall with its feet at y≈602, centred on x≈385. A
    // 754px box makes that half the cell with the feet 83% down, like the
    // base bear; the lie-down clip's feet (y≈644) still fit inside it.
    box: { x: 8, y: -24, size: 754 },
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true, clearCreases: true },
    /*
     * Each clip is read from its .gif (31 frames at 6fps, already cut out).
     * The second set, without the electric sparks:
     *   idle.gif      standing, breathing, blinking
     *   cheer.gif     3-13 pumps a fist, 14-17 bounces, 18-21 pumps again
     *   run.gif       0-2 sets off; from 15 ONE STRIDE IS 4 FRAMES (15 matches 19, 23)
     *   dizzy.gif     spiral eyes, a ring of stars from frame 2
     *   tired.gif     0-3 stands, 4 slumps, 5+ hunched and teary
     *   lie-down.gif  0-11 winces, 12-15 drops, 16+ lies flat
     */
    band: {
      idle: ['idle', [1, 4, 6, 9, 11, 14, 16, 19, 21, 24, 26, 29]],
      cheer: ['cheer', [3, 5, 7, 9, 11, 13, 15, 17, 18, 19, 20, 21]],
      move: ['run', [15, 16, 17, 18, 19, 20, 21, 22]],
      rest: ['lie-down', [16, 18, 20, 22, 24, 26, 28, 30]],
      unwell: ['dizzy', [4, 7, 10, 13, 16, 19, 22, 25]],
      sad: ['tired', [5, 8, 11, 14, 17, 20, 23, 26]],
      // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
      faint: ['lie-down', [9, 11, 12, 13, 14, 15, 16, 18]],
    },
  },
  bearScholar: {
    source: 'bear-scholar',
    output: 'bearScholar.png',
    // Stands as tall as the runner with its feet on the same line, so it takes
    // the runner's box and the three bear forms match in size.
    box: { x: 8, y: -24, size: 754 },
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true, clearCreases: true },
    /*
     * GIFs, 31 frames at 6fps, already cut out:
     *   idle.gif      standing, blinking, swaying a little
     *   cheer.gif     0-11 stands smiling, 12-24 holds its diploma up
     *   walk.gif      ONE CYCLE IS 16 FRAMES (frame 6 matches 22)
     *   dizzy.gif     3+ spiral eyes, a ring of stars
     *   cry.gif       0-4 stands, 5+ slumps and cries
     *   collapse.gif  drops its scroll, 16-18 falls, 19+ flat out, X eyes
     * No sleeping pose, so `rest` dozes on its feet: the idle's eyes-closed
     * stretches (6-9, 16-19), which also carries `exhausted`.
     */
    band: {
      idle: ['idle', [1, 4, 6, 9, 11, 14, 16, 19, 21, 24, 26, 29]],
      cheer: ['cheer', [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]],
      move: ['walk', [6, 8, 10, 12, 14, 16, 18, 20]],
      rest: ['idle', [6, 7, 8, 9, 16, 17, 18, 19]],
      unwell: ['dizzy', [4, 7, 11, 14, 18, 21, 25, 28]],
      sad: ['cry', [5, 8, 11, 15, 18, 21, 25, 28]],
      // Ends flat out: the last cell is the one HOLDS_LAST_FRAME parks on.
      faint: ['collapse', [12, 14, 15, 16, 17, 18, 19, 22]],
    },
  },
  /*
   * The bunny's forms share one box. Every clip stands the bunny 378px tall
   * with its feet at y≈614, centred on x≈385; this box makes that the base
   * bunny's 72px with its feet at y=106, centred, so evolving does not resize
   * it. The highest jump (y≈96) and lowest sprawl (y≈650) both still fit.
   *
   * Fur near white, so the default key (see buildLifterVideos.mjs).
   */
  bunnyLifter: {
    source: 'bunny-lifter',
    output: 'bunnyLifter.png',
    box: { x: 52, y: 58, size: 672 },
    key: {},
    /*
     *   idle-flex.gif  124 frames: 0-96 standing, ~100-116 flexes, then stands
     *   cheer.gif      0-4 stands, 7-20 jumps and pumps a fist
     *   run.gif        a hop, ONE CYCLE IS 18 FRAMES (6 matches 24)
     *   dizzy.gif      4+ spiral eyes, a ring of stars
     *   sad.gif        3 droops, 4+ ears down and crying
     *   collapse.gif   10-15 winces, 16 drops, 17+ lies flat
     */
    band: {
      idle: ['idle-flex', [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88]],
      cheer: ['cheer', [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]],
      move: ['run', [6, 8, 11, 13, 15, 17, 20, 22]],
      rest: ['collapse', [17, 19, 21, 23, 25, 27, 29, 30]],
      unwell: ['dizzy', [5, 8, 11, 14, 17, 20, 23, 26]],
      sad: ['sad', [5, 8, 11, 14, 17, 20, 23, 26]],
      // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
      faint: ['collapse', [8, 10, 12, 14, 15, 16, 17, 19]],
    },
  },
  bunnyRunner: {
    source: 'bunny-runner',
    output: 'bunnyRunner.png',
    box: { x: 52, y: 58, size: 672 },
    key: {},
    /*
     *   idle.gif      27 frames, standing, blinking
     *   cheer.gif     6-20 jumps, medal flying
     *   run.gif       a quick hop, ONE STRIDE IS 3 FRAMES
     *   dizzy.gif     2+ a ring of stars
     *   tired.gif     3 droops, 4+ ears down and crying
     *   lie-down.gif  0-11 winces, 12-14 drops, 15+ lies flat
     */
    band: {
      idle: ['idle', [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]],
      cheer: ['cheer', [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]],
      // Two whole strides, so it loops.
      move: ['run', [6, 7, 8, 9, 10, 11]],
      rest: ['lie-down', [16, 18, 20, 22, 24, 26, 28, 30]],
      unwell: ['dizzy', [4, 7, 10, 13, 16, 19, 22, 25]],
      sad: ['tired', [5, 8, 11, 14, 17, 20, 23, 26]],
      faint: ['lie-down', [8, 10, 11, 12, 13, 14, 15, 17]],
    },
  },
  bunnyScholar: {
    source: 'bunny-scholar',
    output: 'bunnyScholar.png',
    box: { x: 52, y: 58, size: 672 },
    key: {},
    /*
     *   idle.gif      27 frames, standing with its book, blinking
     *   cheer.gif     10-21 jumps, holding the book up
     *   walk.gif      ONE STEP IS 5 FRAMES
     *   dizzy.gif     1+ a ring of stars
     *   cry.gif       2 droops, 3+ ears down and crying
     *   collapse.gif  0-15 winces, drops the book, 16-17 falls, 18+ flat out
     */
    band: {
      idle: ['idle', [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]],
      cheer: ['cheer', [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]],
      // Two whole steps, so it loops.
      move: ['walk', [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]],
      rest: ['collapse', [18, 20, 22, 24, 26, 27, 28, 30]],
      unwell: ['dizzy', [3, 6, 9, 12, 15, 18, 21, 24]],
      sad: ['cry', [4, 7, 10, 13, 16, 19, 22, 25]],
      faint: ['collapse', [9, 11, 13, 14, 15, 16, 17, 19]],
    },
  },
  /*
   * The bichon runner, redrawn as GIFs (replacing the sheet assembled from
   * slices). It stands 374px tall with its feet at y≈593, centred on x≈385;
   * this box makes that 80px with its feet at y=110, as the base bichon's art
   * sits (every bichon form also shares its 0.78 artScale). The top of the
   * cheer's jump (y≈117) and the lie-down's sprawl (feet y≈605) both fit.
   */
  bichonRunner: {
    source: 'bichon-runner',
    output: 'bichonRunner.png',
    box: { x: 86, y: 79, size: 598 },
    // Under its outline the GIFs carry a pale rim two art pixels (six source
    // pixels) deep, grey then near white, which showed as a white line under
    // its feet; three passes only took the outer half. Not `greyFringe`: its
    // outline is a low-saturation blue-grey that that would peel too.
    key: { fringePasses: 6 },
    // The GIFs make the fur above the headband see-through on some frames,
    // behind gaps in the dashed outline (see fillBehindGaps).
    capBehindGaps: { radius: 8, nextTo: (r, g, b) => r > 190 && g > 80 && g < 170 && b < 90 },
    /*
     * GIFs at 6fps, already cut out:
     *   idle.gif      28 frames: 0-15 stands and blinks, 16-23 wags its
     *                 tail (ONE WAG IS ABOUT 3 FRAMES), 24+ settles
     *   cheer.gif     0-5 stands, 6-23 jumps, 24+ lands
     *   run.gif       ONE STRIDE IS 3 FRAMES (0 matches 3, 6 ... 27)
     *   dizzy.gif     2+ spiral eyes and stars, ONE CYCLE IS 3 FRAMES
     *   tired.gif     0-3 stands, 4-11 slumps, 12+ hunched and teary
     *   lie-down.gif  0-9 winces, 10-16 drops, 17+ lies flat
     */
    band: {
      // Just the tail wag, every frame of it.
      idle: ['idle', [16, 17, 18, 19, 20, 21, 22, 23]],
      cheer: ['cheer', [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]],
      // Two whole strides, so it loops.
      move: ['run', [0, 1, 2, 3, 4, 5]],
      rest: ['lie-down', [17, 19, 21, 23, 25, 27, 29, 30]],
      // Two whole cycles, so it loops.
      unwell: ['dizzy', [2, 3, 4, 5, 6, 7]],
      sad: ['tired', [5, 8, 11, 14, 17, 20, 23, 26]],
      // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
      faint: ['lie-down', [6, 8, 10, 12, 14, 15, 16, 17]],
    },
  },
  /*
   * The shiba runner, redrawn as GIFs (replacing the re-gridded sheet). It
   * stands 398px tall with its feet at y≈602, centred on x≈385; this box makes
   * that the base shiba's 64px with its feet at y=101. The top of the cheer's
   * jump (y≈63) and the lie-down's sprawl (feet y≈620) both fit. Strong
   * colours, so like the otter it peels the light-grey ring round its outline.
   */
  shibaRunner: {
    source: 'shiba-runner',
    output: 'shibaRunner.png',
    box: { x: -13, y: -26, size: 796 },
    key: { greyFringe: true, fringePasses: 4 },
    /*
     * GIFs at 6fps, already cut out:
     *   idle.gif      28 frames, standing, blinking, wagging; 0 matches 27
     *   cheer.gif     0-2 stands, 3-22 jumps, 23+ lands
     *   run.gif       0-11: ONE STRIDE IS 3 FRAMES; after that it drifts
     *   dizzy.gif     2+ spiral eyes and a ring of stars
     *   tired.gif     0-2 stands, 3+ lies with its head down
     *   lie-down.gif  0-12 winces, 13-14 drops, 15+ lies flat
     */
    band: {
      idle: ['idle', [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]],
      cheer: ['cheer', [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]],
      // Two whole strides, so it loops.
      move: ['run', [0, 1, 2, 3, 4, 5]],
      rest: ['lie-down', [15, 17, 19, 21, 23, 25, 27, 30]],
      unwell: ['dizzy', [2, 3, 4, 5, 6, 7, 8, 9]],
      sad: ['tired', [4, 7, 10, 13, 16, 19, 22, 25]],
      // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
      faint: ['lie-down', [5, 7, 9, 11, 12, 13, 14, 15]],
    },
  },
  /*
   * The base otter, redrawn as GIFs (replacing the old hand-packed 6x10
   * sheet). It sits 408px tall with its feet at y≈611, centred on x≈385;
   * this box makes that the bunny's 72px with its feet at y=106, centred. The
   * top of the cheer's jump (y≈18) and the collapse's sprawl (x 66-677, feet
   * y≈623) both still fit.
   */
  otter: {
    source: 'otter',
    output: 'otter.png',
    box: { x: 25, y: 15, size: 720 },
    // The GIFs carry a light-grey ring round the outline (the art's edge
    // blended into the white it was drawn on), which shows on a dark room.
    // The otter's browns are strong, so like the bears it can peel grey edge
    // pixels; four passes take the whole ring without thinning the sparkles.
    key: { greyFringe: true, fringePasses: 4 },
    /*
     * GIFs at 6fps, already cut out:
     *   idle.gif      27 frames, sitting, blinking and smiling; 0 matches 26
     *   cheer.gif     0-6 sits, 7-18 jumps with its arms up, 19+ lands
     *   run.gif       0 sets off; from 1 ONE STRIDE IS 3 FRAMES
     *   dizzy.gif     1+ spiral eyes and stars, ONE CYCLE IS 6 FRAMES
     *   cry.gif       0-2 sits, 3-5 slumps, 6+ hunched and crying
     *   collapse.gif  0-12 winces, 13-16 drops, 17+ lies flat, eyes shut
     */
    band: {
      idle: ['idle', [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]],
      cheer: ['cheer', [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]],
      // Two whole strides, so it loops.
      move: ['run', [1, 2, 3, 4, 5, 6]],
      rest: ['collapse', [17, 19, 21, 23, 25, 27, 29, 30]],
      // One whole cycle, so it loops.
      unwell: ['dizzy', [1, 2, 3, 4, 5, 6]],
      sad: ['cry', [6, 9, 12, 15, 18, 21, 24, 27]],
      // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
      faint: ['collapse', [4, 7, 10, 12, 13, 14, 15, 17]],
    },
  },
};

const form = FORMS[process.argv[2]];
if (!form) {
  console.error(`usage: node scripts/buildVideoSheet.mjs <${Object.keys(FORMS).join(' | ')}>`);
  process.exit(1);
}
const videos = path.join(root, 'assets/source/video', form.source);
const work = fs.mkdtempSync(path.join(root, '.sheet-'));

/** Bands laid down in this order, each starting on a fresh row. */
const ORDER = ['idle', 'cheer', 'move', 'rest', 'unwell', 'sad', 'faint'];

const PLAN = [];
for (const band of ORDER) {
  const [video, frames] = form.band[band];
  for (let i = 0; i < frames.length; i += COLUMNS) {
    PLAN.push({ video, frames: frames.slice(i, i + COLUMNS), band });
  }
}
const ROWS = PLAN.length;

const read = (file) => PNG.sync.read(fs.readFileSync(file));
const write = (png, file) => fs.writeFileSync(file, PNG.sync.write(png));

/** Copies `box` out of `frame`; any part of the box past the frame's edge stays transparent. */
const cut = (frame, box) => {
  const out = new PNG({ width: box.size, height: box.size, fill: true });
  for (let y = 0; y < box.size; y += 1) {
    const sy = box.y + y;
    if (sy < 0 || sy >= frame.height) continue;
    for (let x = 0; x < box.size; x += 1) {
      const sx = box.x + x;
      if (sx < 0 || sx >= frame.width) continue;
      const from = (frame.width * sy + sx) << 2;
      const to = (box.size * y + x) << 2;
      for (let c = 0; c < 4; c += 1) out.data[to + c] = frame.data[from + c];
    }
  }
  return out;
};

/** Pulls one frame out of a video, losslessly, at source size. */
const grab = (clip, frame, to) => {
  // A pre-cut GIF of a clip wins over its video, as in buildLifterVideos.mjs.
  const gif = path.join(videos, `${clip}.gif`);
  const source = fs.existsSync(gif) ? gif : path.join(videos, `${clip}.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', source,
    '-vf', `select='eq(n\\,${frame})'`, '-frames:v', '1', '-pix_fmt', 'rgba', to,
  ], { stdio: 'ignore' });
};

const sheet = new PNG({ width: CELL * COLUMNS, height: CELL * ROWS, fill: true });

try {
  PLAN.forEach((band, row) => {
    band.frames.forEach((frame, column) => {
      const raw = path.join(work, `raw-${row}-${column}.png`);
      const keyed = path.join(work, `keyed-${row}-${column}.png`);
      const small = path.join(work, `small-${row}-${column}.png`);

      grab(band.video, frame, raw);
      // Keyed at full size so the downscale resamples the ALPHA too, which is
      // what stops a pale fringe forming where the art meets the background.
      const key = { ...form.key, cutOutPockets: form.cutOutPockets?.includes(band.video) ?? false };
      const frameIn = read(raw);
      if (form.fillHoles?.clips.includes(band.video)) fillHoles(frameIn, form.fillHoles.maxArea);
      if (form.capBehindGaps) fillBehindGaps(frameIn, form.capBehindGaps);
      write(cut(keyBackground(frameIn, key), form.box), keyed);
      execFileSync('sips', ['-z', String(CELL), String(CELL), keyed, '--out', small], { stdio: 'ignore' });

      const cell = read(small);
      for (let y = 0; y < cell.height; y += 1) {
        for (let x = 0; x < cell.width; x += 1) {
          const from = ((cell.width * y) + x) << 2;
          if (cell.data[from + 3] === 0) continue;
          const to = ((sheet.width * (row * CELL + y)) + (column * CELL + x)) << 2;
          for (let c = 0; c < 4; c += 1) sheet.data[to + c] = cell.data[from + c];
        }
      }
    });
  });

  write(sheet, path.join(pets, form.output));
  console.log(`wrote assets/pet/${form.output}  ${CELL * COLUMNS}x${CELL * ROWS}, ${ROWS} rows`);
  // Printed so the frame map in petSprites.ts can be checked against the sheet
  // that actually exists, rather than against what this plan used to say.
  let row = 0;
  for (const band of ORDER) {
    const frames = form.band[band][1];
    const rows = Math.ceil(frames.length / COLUMNS);
    const cells = frames.map((_, i) => `[${row + Math.floor(i / COLUMNS)}, ${i % COLUMNS}]`);
    console.log(`  ${band.padEnd(7)} ${cells.join(', ')}`);
    row += rows;
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
