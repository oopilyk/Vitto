#!/usr/bin/env node
/**
 * assembleSpriteSlices.mjs
 *
 * Builds one sprite sheet the app can slice out of loose "slice" images — the
 * way generated art tends to arrive: a handful of PNGs, each holding one band
 * of poses (six idles, a run cycle, the queasy faces) drawn wherever the
 * generator put them, at whatever spacing, sometimes touching.
 *
 * Per slice image:
 *   1. Drops the near-transparent haze some generators leave behind the art
 *      (alpha below `OPAQUE` becomes fully clear), then finds each pose as a
 *      connected blob of remaining pixels. Blobs are read into rows by their
 *      vertical position, left to right, which is the order the bands list them.
 *   2. Halves the resolution with a 2x2 box filter on premultiplied colour. The
 *      slices come in at ~400px a pose, which would make a 4-column sheet
 *      several thousand pixels tall; half size still leaves the art well above
 *      the largest stage the app renders it at, so it is only ever downscaled.
 *   3. Copies each pose into its cell on the output grid, feet centred and
 *      floor on one baseline (the same anchoring as `normalizeSpriteSheet.mjs`,
 *      for the same reason: box-centring an idle loop makes it slide).
 *
 * The cell is sized (`--match`) so the idle art fills the same share of its
 * cell as the breed's base sheet and sits the same distance off the floor, so
 * the pet neither resizes nor hovers when it evolves.
 *
 * The bichon runner is the first sheet built this way; its slices and their
 * band order live in `SHEETS` below. Re-run from `mobile/`:
 *
 *   node scripts/assembleSpriteSlices.mjs bichonRunner
 *   node scripts/assembleSpriteSlices.mjs bichonRunner --preview /some/dir
 *
 * Uses only `pngjs` (a devDependency of `mobile`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'assets', 'pet');

/** Alpha above which a pixel is part of the pet. Below it: haze, dropped. */
const OPAQUE = 40;
/** Blobs smaller than this are stray specks, not poses. */
const MIN_BLOB = 2000;
/** Fraction of a pose's height treated as "the feet" for the anchor. */
const FOOT_SLICE = 0.12;
/** Two blobs whose vertical centres are closer than this share a row. */
const ROW_TOLERANCE = 150;

/**
 * A sheet's slices, in band order. Each slice's poses fill the grid left to
 * right, top to bottom, starting on the row named; a band that does not fill its
 * last row leaves the rest of that row empty, like the pack sheets do.
 */
const SHEETS = {
  bichonRunner: {
    columns: 4,
    match: { file: 'bichon.png', cell: 128 },
    output: 'bichonRunner.png',
    slices: [
      { file: 'source/bichonRunner/idle.png', row: 0, poses: 6 },
      { file: 'source/bichonRunner/run.png', row: 2, poses: 6 },
      { file: 'source/bichonRunner/unwell.png', row: 4, poses: 10 },
      { file: 'source/bichonRunner/faint.png', row: 7, poses: 8 },
    ],
  },
};

const read = (file) => PNG.sync.read(fs.readFileSync(path.join(assets, file)));

/** Every pose in a slice image, as {row, column, pixels}: a cleaned, half-size RGBA crop. */
const posesOf = (png) => {
  const { width, height, data } = png;
  const seen = new Uint8Array(width * height);
  const blobs = [];
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start] || data[start * 4 + 3] < OPAQUE) continue;
      const stack = [start];
      seen[start] = 1;
      const blob = { minX: x, maxX: x, minY: y, maxY: y, size: 0, members: [] };
      while (stack.length) {
        const index = stack.pop();
        blob.size += 1;
        blob.members.push(index);
        const cx = index % width;
        const cy = (index - cx) / width;
        if (cx < blob.minX) blob.minX = cx;
        if (cx > blob.maxX) blob.maxX = cx;
        if (cy < blob.minY) blob.minY = cy;
        if (cy > blob.maxY) blob.maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (seen[next] || data[next * 4 + 3] < OPAQUE) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
      if (blob.size >= MIN_BLOB) blobs.push(blob);
      else blob.members.length = 0;
    }

  // Rows by vertical centre, then left to right within a row.
  blobs.sort((a, b) => (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2);
  const rows = [];
  for (const blob of blobs) {
    const centre = (blob.minY + blob.maxY) / 2;
    const row = rows.find((r) => Math.abs(r.centre - centre) < ROW_TOLERANCE);
    if (row) row.blobs.push(blob);
    else rows.push({ centre, blobs: [blob] });
  }
  rows.sort((a, b) => a.centre - b.centre);

  const poses = [];
  for (const row of rows)
    for (const blob of row.blobs.sort((a, b) => a.minX - b.minX)) {
      // Only this blob's own pixels come along — a neighbour's tail poking
      // into the bounding box stays behind.
      const w = blob.maxX - blob.minX + 1;
      const h = blob.maxY - blob.minY + 1;
      const crop = Buffer.alloc(w * h * 4);
      for (const index of blob.members) {
        const x = index % width;
        const y = (index - x) / width;
        const from = index * 4;
        const to = ((y - blob.minY) * w + (x - blob.minX)) * 4;
        crop[to] = data[from];
        crop[to + 1] = data[from + 1];
        crop[to + 2] = data[from + 2];
        crop[to + 3] = data[from + 3];
      }
      poses.push(halve({ width: w, height: h, data: crop }));
    }
  return poses;
};

/** 2x2 box filter on premultiplied colour, so clear pixels do not darken edges. */
const halve = ({ width, height, data }) => {
  const w = Math.ceil(width / 2);
  const h = Math.ceil(height / 2);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy += 1)
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = x * 2 + dx;
          const sy = y * 2 + dy;
          if (sx >= width || sy >= height) continue;
          const i = (sy * width + sx) * 4;
          const alpha = data[i + 3];
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += alpha;
          n += 1;
        }
      const o = (y * w + x) * 4;
      if (a === 0) continue;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round(a / n);
    }
  return { width: w, height: h, data: out };
};

const alphaAt = (pose, x, y) => pose.data[(y * pose.width + x) * 4 + 3];

/** Horizontal centre of the feet — the bottom slice of the silhouette. */
const feetCentre = (pose) => {
  const cut = pose.height - 1 - Math.round(pose.height * FOOT_SLICE);
  let lo = pose.width;
  let hi = -1;
  for (let y = Math.max(0, cut); y < pose.height; y += 1)
    for (let x = 0; x < pose.width; x += 1)
      if (alphaAt(pose, x, y) >= OPAQUE) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return lo > hi ? pose.width / 2 : (lo + hi) / 2;
};

/** The reference sheet's proportions: how tall its art is, and how far off the floor. */
const matchMetrics = (file, cell) => {
  const png = read(file);
  const rows = png.height / cell;
  const columns = png.width / cell;
  const frames = [];
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < columns; c += 1) {
      let top = cell;
      let bottom = -1;
      for (let y = 0; y < cell; y += 1)
        for (let x = 0; x < cell; x += 1)
          if (png.data[((r * cell + y) * png.width + c * cell + x) * 4 + 3] > OPAQUE) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
      if (bottom >= 0) frames.push({ height: bottom - top + 1, gap: cell - 1 - bottom });
    }
  const mean = (pick) => frames.reduce((t, f) => t + pick(f), 0) / frames.length;
  return { heightShare: mean((f) => f.height) / cell, gapShare: mean((f) => f.gap) / cell };
};

const build = (name, previewDir) => {
  const sheet = SHEETS[name];
  if (!sheet) throw new Error(`no sheet named ${name}; known: ${Object.keys(SHEETS).join(', ')}`);

  const placements = [];
  for (const slice of sheet.slices) {
    const poses = posesOf(read(slice.file));
    if (poses.length !== slice.poses) {
      throw new Error(`${slice.file}: found ${poses.length} poses, expected ${slice.poses}`);
    }
    poses.forEach((pose, i) => {
      placements.push({
        pose,
        row: slice.row + Math.floor(i / sheet.columns),
        column: i % sheet.columns,
        band: path.basename(slice.file, '.png'),
      });
    });
  }
  const rows = Math.max(...placements.map((p) => p.row)) + 1;

  const { heightShare, gapShare } = matchMetrics(sheet.match.file, sheet.match.cell);
  const idle = placements.filter((p) => p.band === 'idle');
  const idleHeight = idle.reduce((t, p) => t + p.pose.height, 0) / idle.length;
  const cell = Math.round(idleHeight / heightShare);
  const baselineGap = Math.round(cell * gapShare);
  const widest = Math.max(...placements.map((p) => p.pose.width));
  const tallest = Math.max(...placements.map((p) => p.pose.height));
  if (widest > cell || tallest + baselineGap > cell) {
    throw new Error(`cell ${cell} too small for the art (widest ${widest}, tallest ${tallest} + gap ${baselineGap})`);
  }

  const out = new PNG({ width: sheet.columns * cell, height: rows * cell });
  out.data.fill(0);
  for (const { pose, row, column } of placements) {
    const cellX = column * cell;
    const cellY = row * cell;
    const dx = Math.round(cellX + cell / 2 - feetCentre(pose));
    const dy = cellY + cell - 1 - baselineGap - (pose.height - 1);
    for (let y = 0; y < pose.height; y += 1)
      for (let x = 0; x < pose.width; x += 1) {
        const from = (y * pose.width + x) * 4;
        if (pose.data[from + 3] === 0) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (tx < cellX || tx >= cellX + cell || ty < cellY || ty >= cellY + cell) continue;
        pose.data.copy(out.data, (ty * out.width + tx) * 4, from, from + 4);
      }
  }

  const destination = path.join(assets, sheet.output);
  fs.writeFileSync(destination, PNG.sync.write(out));
  console.log(`${name}: ${placements.length} poses onto a ${sheet.columns}x${rows} grid, cell ${cell}px, floor gap ${baselineGap}px`);
  console.log(`  reference ${sheet.match.file}: art ${(100 * heightShare).toFixed(1)}% of cell, floor gap ${(100 * gapShare).toFixed(1)}%`);
  console.log(`  -> ${path.relative(process.cwd(), destination)} (${out.width}x${out.height})`);
  const perRow = new Map();
  placements.forEach((p) => perRow.set(p.row, (perRow.get(p.row) ?? 0) + 1));
  console.log('  frames per row: ' + [...perRow.entries()].map(([r, n]) => `r${r}:${n}`).join(' '));

  if (previewDir) {
    // A quarter-size contact sheet with cell borders, for eyeballing alignment.
    const scale = 4;
    const preview = new PNG({ width: out.width / scale, height: out.height / scale });
    for (let y = 0; y < preview.height; y += 1)
      for (let x = 0; x < preview.width; x += 1) {
        const o = (y * preview.width + x) * 4;
        const onGrid = (x * scale) % cell < scale || (y * scale) % cell < scale;
        const i = (y * scale * out.width + x * scale) * 4;
        if (out.data[i + 3] > 0) out.data.copy(preview.data, o, i, i + 4);
        else { preview.data[o] = onGrid ? 200 : 40; preview.data[o + 1] = onGrid ? 60 : 40; preview.data[o + 2] = onGrid ? 60 : 48; preview.data[o + 3] = 255; }
      }
    fs.mkdirSync(previewDir, { recursive: true });
    const file = path.join(previewDir, `${name}-contact.png`);
    fs.writeFileSync(file, PNG.sync.write(preview));
    console.log(`  preview -> ${file}`);
  }
};

const args = process.argv.slice(2);
const previewIndex = args.indexOf('--preview');
const previewDir = previewIndex === -1 ? null : args[previewIndex + 1];
const names = args.filter((a, i) => !a.startsWith('--') && i !== previewIndex + 1);
for (const name of names.length ? names : Object.keys(SHEETS)) build(name, previewDir);
