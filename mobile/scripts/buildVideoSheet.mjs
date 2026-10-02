/**
 * Builds a pet form's sprite sheet from the source videos it was animated as.
 *
 *   node scripts/buildVideoSheet.mjs <bearLifter | bearRunner | bearScholar>
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
import { fillHoles, keyBackground } from './keyBackground.mjs';

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
