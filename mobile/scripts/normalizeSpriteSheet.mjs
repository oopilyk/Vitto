#!/usr/bin/env node
/**
 * normalizeSpriteSheet.mjs
 *
 * Re-lays a hand-drawn sprite sheet onto the strict uniform grid the app slices.
 *
 * `SpriteFrame` cuts frames at `[row * cell, column * cell]`, which assumes every
 * sprite sits in an exact cell. Generated art usually does not: the shiba runner
 * sheet arrived 756x2079 (nominally 11 rows of 189px) with its drawn rows
 * actually spaced 183-206px apart, so the drift accumulated until row 5's sprite
 * touched the bottom of its cell and row 6's bled into the one above. Sliced on
 * the nominal grid it would clip heads and feet.
 *
 * What this does, per sprite:
 *   1. Finds the real rows as horizontal bands of opaque pixels, then the
 *      sprites within each row as vertical bands. Nothing assumes a pitch.
 *   2. Copies the sprite's pixels UNCHANGED into a fresh cell -- placement only,
 *      never resampling, so hard-edged pixel art keeps its edges.
 *   3. Anchors it by the horizontal centre of its feet (the bottom slice of the
 *      silhouette) rather than the centre of its whole bounding box. A tail or a
 *      raised paw swings the box centre around, which is what makes an idle loop
 *      appear to slide side to side; the feet stay put.
 *   4. Sits every sprite's floor on one baseline, so the pet does not bob between
 *      frames of the same animation.
 *
 * The output cell is chosen (`--match`) so the art fills the same share of its
 * cell as the breed's base sheet, and sits the same distance off the cell floor.
 * That is what stops the pet changing size or hovering when it evolves. Because
 * the cell is sized to the art rather than the art scaled to the cell, no pixel
 * is ever resampled.
 *
 *   node mobile/scripts/normalizeSpriteSheet.mjs <source.png> <out.png> \
 *     --grid 4x11 --match assets/pet/shiba.png:128
 *
 * Uses only `pngjs` (a devDependency of `mobile`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

/** Alpha above which a pixel counts as part of the pet. */
const OPAQUE = 40;

/** Fraction of a sprite's height treated as "the feet" for the anchor. */
const FOOT_SLICE = 0.12;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

/** Runs of consecutive non-zero entries — the sheet's real rows, or a row's real sprites. */
const bandsOf = (counts) => {
  const bands = [];
  let start = null;
  counts.forEach((n, i) => {
    if (n > 0 && start === null) start = i;
    else if (n === 0 && start !== null) { bands.push([start, i - 1]); start = null; }
  });
  if (start !== null) bands.push([start, counts.length - 1]);
  return bands;
};

const reader = (png) => {
  const { width, height, data } = png;
  return {
    width,
    height,
    alpha: (x, y) => data[(y * width + x) * 4 + 3],
    at: (x, y) => (y * width + x) * 4,
    data,
  };
};

/** Every drawn sprite, found without assuming any pitch. */
const findSprites = (png) => {
  const { width: W, height: H, alpha } = reader(png);
  const rowCounts = new Array(H).fill(0);
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) if (alpha(x, y) > OPAQUE) rowCounts[y] += 1;

  const sprites = [];
  bandsOf(rowCounts).forEach(([top, bottom], row) => {
    const colCounts = new Array(W).fill(0);
    for (let x = 0; x < W; x += 1)
      for (let y = top; y <= bottom; y += 1) if (alpha(x, y) > OPAQUE) colCounts[x] += 1;

    bandsOf(colCounts).forEach(([left, right], column) => {
      // This sprite's own vertical extent, not the whole row's.
      let y0 = bottom;
      let y1 = top;
      for (let y = top; y <= bottom; y += 1)
        for (let x = left; x <= right; x += 1)
          if (alpha(x, y) > OPAQUE) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
      sprites.push({ row, column, x0: left, x1: right, y0, y1 });
    });
  });
  return sprites;
};

/**
 * The horizontal centre of the sprite's footprint. Falls back to the bounding
 * box centre for a sprite with no distinct feet (one lying flat), where the two
 * are the same thing anyway.
 */
const feetCentre = (sprite, alpha) => {
  const cut = sprite.y1 - Math.round((sprite.y1 - sprite.y0 + 1) * FOOT_SLICE);
  let lo = sprite.x1;
  let hi = sprite.x0;
  for (let y = Math.max(cut, sprite.y0); y <= sprite.y1; y += 1)
    for (let x = sprite.x0; x <= sprite.x1; x += 1)
      if (alpha(x, y) > OPAQUE) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return lo > hi ? (sprite.x0 + sprite.x1) / 2 : (lo + hi) / 2;
};

/** The reference sheet's proportions: how tall its art is, and how far off the floor. */
const matchMetrics = (file, cell) => {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { alpha } = reader(png);
  const rows = png.height / cell;
  const columns = png.width / cell;
  const frames = [];
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < columns; c += 1) {
      let top = cell;
      let bottom = -1;
      for (let y = 0; y < cell; y += 1)
        for (let x = 0; x < cell; x += 1)
          if (alpha(c * cell + x, r * cell + y) > OPAQUE) { if (y < top) top = y; if (y > bottom) bottom = y; }
      if (bottom >= 0) frames.push({ height: bottom - top + 1, gap: cell - 1 - bottom });
    }
  const mean = (pick) => frames.reduce((t, f) => t + pick(f), 0) / frames.length;
  return { heightShare: mean((f) => f.height) / cell, gapShare: mean((f) => f.gap) / cell };
};

const [source, destination] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.includes(':') || a.endsWith('.png'));
const [columns, rows] = (arg('grid', '4x11')).split('x').map(Number);
const match = arg('match');

const png = PNG.sync.read(fs.readFileSync(source));
const { alpha, at, data } = reader(png);
const sprites = findSprites(png);
sprites.forEach((s) => { s.fx = feetCentre(s, alpha); });

const drawnRows = Math.max(...sprites.map((s) => s.row)) + 1;
if (drawnRows !== rows) {
  console.warn(`warning: found ${drawnRows} drawn rows, expected ${rows}`);
}

// Cell size from the reference sheet's proportions, so evolving does not resize
// the pet. Sized to the art; the art is never scaled to the size.
let cell;
let baselineGap;
if (match) {
  const [refFile, refCell] = match.split(':');
  const { heightShare, gapShare } = matchMetrics(refFile, Number(refCell));
  const idle = sprites.filter((s) => s.row <= 1);
  const idleHeight = idle.reduce((t, s) => t + (s.y1 - s.y0 + 1), 0) / idle.length;
  cell = Math.round(idleHeight / heightShare);
  baselineGap = Math.round(cell * gapShare);
  console.log(`reference ${refFile}: art is ${(100 * heightShare).toFixed(1)}% of cell, floor gap ${(100 * gapShare).toFixed(1)}%`);
} else {
  cell = Math.max(...sprites.map((s) => Math.max(s.x1 - s.x0 + 1, s.y1 - s.y0 + 1))) + 40;
  baselineGap = Math.round(cell * 0.2);
}

const widest = Math.max(...sprites.map((s) => s.x1 - s.x0 + 1));
const tallest = Math.max(...sprites.map((s) => s.y1 - s.y0 + 1));
if (widest > cell || tallest + baselineGap > cell) {
  throw new Error(`cell ${cell} too small for the art (widest ${widest}, tallest ${tallest} + gap ${baselineGap})`);
}

const out = new PNG({ width: columns * cell, height: rows * cell });
out.data.fill(0);

let placed = 0;
for (const sprite of sprites) {
  if (sprite.row >= rows || sprite.column >= columns) {
    console.warn(`skipping sprite at [${sprite.row}, ${sprite.column}] — outside the ${columns}x${rows} grid`);
    continue;
  }
  const cellX = sprite.column * cell;
  const cellY = sprite.row * cell;
  // Feet centred in the cell; floor on the shared baseline.
  const dx = Math.round(cellX + cell / 2 - sprite.fx);
  const dy = cellY + cell - 1 - baselineGap - sprite.y1;

  for (let y = sprite.y0; y <= sprite.y1; y += 1)
    for (let x = sprite.x0; x <= sprite.x1; x += 1) {
      const a = alpha(x, y);
      if (a === 0) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx < cellX || tx >= cellX + cell || ty < cellY || ty >= cellY + cell) continue;
      const from = at(x, y);
      const to = (ty * out.width + tx) * 4;
      out.data[to] = data[from];
      out.data[to + 1] = data[from + 1];
      out.data[to + 2] = data[from + 2];
      out.data[to + 3] = a;
    }
  placed += 1;
}

fs.writeFileSync(destination, PNG.sync.write(out));
console.log(`${source} -> ${destination}`);
console.log(`  ${placed} sprites onto a ${columns}x${rows} grid, cell ${cell}px, floor gap ${baselineGap}px`);
console.log(`  output ${out.width}x${out.height}`);
const perRow = new Map();
sprites.forEach((s) => perRow.set(s.row, (perRow.get(s.row) ?? 0) + 1));
console.log('  frames per row: ' + [...perRow.entries()].map(([r, n]) => `r${r}:${n}`).join(' '));
