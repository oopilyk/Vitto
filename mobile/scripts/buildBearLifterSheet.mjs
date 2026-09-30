/**
 * Builds `assets/pet/bearLifter.png` from the four source videos.
 *
 *   node scripts/buildBearLifterSheet.mjs
 *
 * The lifter bear was animated as video rather than drawn as a sheet, and the
 * app cannot play video for a pet: `SpriteFrame` works by sliding one PNG
 * behind a 128px window, and everything built on it -- the tint wash for
 * ailments, `artScale`, the floor anchoring, the Dynamic Island still -- reads
 * that sheet. So the frames are cut out and laid into the same 4x8 grid every
 * other pet uses, and nothing downstream has to know where they came from.
 *
 * Two things make the result line up with the hand-drawn sheets:
 *
 *   * ONE transform for every frame. The crop and scale are fixed constants,
 *     never measured per frame, so the bear does not jitter from cell to cell.
 *     Its own motion survives; the anchor does not move.
 *   * The floor line is matched to the existing art. Measured on bearLifter's
 *     old cells the feet sit at y≈106 of 128; in these videos they land at
 *     ≈100 after scaling, so every frame is nudged down by FLOOR_NUDGE.
 *
 * The background is keyed by flooding inward from the border, the same way
 * `buildAppIcons.mjs` does it, so white INSIDE the art (the eye glints, the
 * highlight on the honey pot) survives.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { keyBackground } from './keyBackground.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pets = path.join(root, 'assets/pet');
/** Source clips live apart from the sprite sheets: they are input, not app assets. */
const videos = path.join(root, 'assets/source/video/bear-lifter');
const work = fs.mkdtempSync(path.join(root, '.sheet-'));

const CELL = 128;
const COLUMNS = 4;
/**
 * The square of the 768px video frame that becomes one 128px sheet cell.
 *
 * THE SAME BOX `BEAR_LIFTER_VIDEOS.cell` gives PetVideo. On iOS the clips play
 * instead of these frames, so if the two framed the bear differently it would
 * jump the moment an animation had no clip and fell back to the sheet. Derived
 * from the union of the content across all four clips: the bear stands with its
 * feet at y≈600 and is centred on x≈386, which this box puts at y=106 and x=64
 * of the cell -- where the hand-drawn sheets put them.
 */
const CELL_BOX = { x: 26, y: 4, size: 720 };
const TOLERANCE = 18;

const VIDEOS = {
  idle: 'idle-flex.mp4',
  walk: 'walk.mp4',
  states: 'states.mp4',
  pot: 'pot.mp4',
};

/**
 * Where each band's frames come from. Read off the videos as 4x4 contact
 * sheets (index = position x 8); every clip is 124 frames at 24fps:
 *
 *   idle    0-56 standing, 60-104 rises into a flex and holds it, 108+ lowers
 *   states  0-16 standing, 24-56 yawning, 64-88 sitting, 96-123 curled up
 *   pot     the whole clip is sitting, eating out of the honey pot
 *   walk    a continuous walk; ONE CYCLE IS 25 FRAMES (measured by finding the
 *           frame that best matches frame 0), so the band samples across
 *           exactly that and loops seamlessly instead of drifting.
 *
 * Twelve frames a band for the three the eye follows, eight for the rest --
 * the density bichonLifter established. Sampled so playback at the shared
 * FRAME_MS roughly matches the speed the clips were animated at.
 */
const BAND = {
  idle: { video: 'idle', frames: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] },
  cheer: { video: 'idle', frames: [60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104] },
  move: { video: 'walk', frames: [0, 2, 4, 6, 8, 10, 13, 15, 17, 19, 21, 23] },
  rest: { video: 'pot', frames: [0, 14, 28, 42, 56, 70, 84, 98] },
  unwell: { video: 'states', frames: [24, 28, 32, 36, 40, 44, 48, 52] },
  sad: { video: 'states', frames: [64, 68, 72, 76, 80, 84, 88, 92] },
  faint: { video: 'states', frames: [96, 100, 104, 108, 112, 116, 120, 123] },
};

/** Bands laid down in this order, each starting on a fresh row. */
const ORDER = ['idle', 'cheer', 'move', 'rest', 'unwell', 'sad', 'faint'];

const PLAN = [];
for (const band of ORDER) {
  const { video, frames } = BAND[band];
  for (let i = 0; i < frames.length; i += COLUMNS) {
    PLAN.push({ video, frames: frames.slice(i, i + COLUMNS), band });
  }
}
const ROWS = PLAN.length;

const read = (file) => PNG.sync.read(fs.readFileSync(file));
const write = (png, file) => fs.writeFileSync(file, PNG.sync.write(png));


/** Pulls one frame out of a video, losslessly, at source size. */
const grab = (video, frame, to) =>
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', path.join(videos, video),
    '-vf', `select='eq(n\\,${frame})'`, '-frames:v', '1', to,
  ], { stdio: 'ignore' });

const sheet = new PNG({ width: CELL * COLUMNS, height: CELL * ROWS, fill: true });

try {
  PLAN.forEach((band, row) => {
    band.frames.forEach((frame, column) => {
      const raw = path.join(work, `raw-${row}-${column}.png`);
      const keyed = path.join(work, `keyed-${row}-${column}.png`);
      const small = path.join(work, `small-${row}-${column}.png`);

      grab(VIDEOS[band.video], frame, raw);
      // Keyed at full size so the downscale resamples the ALPHA too, which is
      // what stops a pale fringe forming where the art meets the background.
      const box = new PNG({ width: CELL_BOX.size, height: CELL_BOX.size, fill: true });
      PNG.bitblt(keyBackground(read(raw), { tolerance: TOLERANCE, pocketArea: 200 }), box, CELL_BOX.x, CELL_BOX.y, CELL_BOX.size, CELL_BOX.size, 0, 0);
      write(box, keyed);
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

  write(sheet, path.join(pets, 'bearLifter.png'));
  console.log(`wrote assets/pet/bearLifter.png  ${CELL * COLUMNS}x${CELL * ROWS}, ${ROWS} rows`);
  // Printed so the frame map in petSprites.ts can be checked against the sheet
  // that actually exists, rather than against what this plan used to say.
  let row = 0;
  for (const band of ORDER) {
    const rows = Math.ceil(BAND[band].frames.length / COLUMNS);
    const cells = BAND[band].frames.map((_, i) => `[${row + Math.floor(i / COLUMNS)}, ${i % COLUMNS}]`);
    console.log(`  ${band.padEnd(7)} ${cells.join(', ')}`);
    row += rows;
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
