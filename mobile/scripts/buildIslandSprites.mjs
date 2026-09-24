/**
 * Cuts one still frame out of every pet sprite sheet for the Dynamic Island.
 *
 * A widget extension cannot play a sprite sheet — it has no timer and no
 * animation loop — so the Live Activity shows one frame per sheet: the first
 * idle frame, the same one the stats screen uses for its portrait. Frames land
 * in `targets/pet-island/sprites/` and `@bacons/apple-targets` turns them into
 * the extension's asset catalog at prebuild (see expo-target.config.js there).
 *
 *   node scripts/buildIslandSprites.mjs
 *
 * Re-run after adding a sheet or changing which frame is idle. The table of
 * idle frames below is checked against `petSprites.ts` by
 * `src/__tests__/petIsland.test.tsx`, so the two cannot quietly drift apart.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const source = path.join(root, 'assets/pet');
const target = path.join(root, 'targets/pet-island/sprites');

/** Sheets are a 4×11 grid of square cells. Mirrors CELL in petSprites.ts. */
export const CELL = 128;

/**
 * [row, column] of the idle frame per sheet file. Every layout's idle starts at
 * the top-left cell except the shiba runner, whose calmest pose is at [0, 3].
 */
export const IDLE_FRAME = {
  shibaRunner: [0, 3],
};
const DEFAULT_IDLE = [0, 0];

const crop = (file) => {
  const png = PNG.sync.read(fs.readFileSync(path.join(source, `${file}.png`)));
  const [row, column] = IDLE_FRAME[file] ?? DEFAULT_IDLE;
  const out = new PNG({ width: CELL, height: CELL });
  PNG.bitblt(png, out, column * CELL, row * CELL, CELL, CELL, 0, 0);
  fs.writeFileSync(path.join(target, `${file}.png`), PNG.sync.write(out));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(target, { recursive: true });
  const files = fs.readdirSync(source).filter((name) => name.endsWith('.png')).map((name) => name.replace(/\.png$/, ''));
  for (const file of files) crop(file);
  console.log(`wrote ${files.length} frames to ${path.relative(root, target)}`);
}
