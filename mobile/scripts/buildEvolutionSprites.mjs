#!/usr/bin/env node
/**
 * buildEvolutionSprites.mjs
 *
 * Derives the "lifter" (strength build) and "scholar" (intelligence build)
 * evolution sprite sheets for every breed from the breed's base sheet, pixel by
 * pixel. Nothing is drawn by hand: each output sheet keeps its base sheet's exact
 * pixel dimensions, cell size and [row, column] frame layout, so the frame maps
 * in `src/components/petSprites.ts` carry over unchanged.
 *
 * Per cell (working on the largest connected blob of opaque pixels, so tears,
 * stars and sparkles do not pull the head anchor around):
 *
 *   lifter   widen the silhouette (broad through the chest, floor kept fixed,
 *            clipped to the cell), warm the palette, and wrap a red sweatband
 *            around the head where the silhouette is opaque, with a knot.
 *   scholar  cool the palette slightly and set a navy mortarboard with a gold
 *            tassel on the head-top anchor, drawn over the fur.
 *
 * Cells whose blob is much wider than tall (collapsed / curled / asleep) only get
 * the body treatment — there is no reliable head to hang an accessory on.
 *
 * Inputs:  mobile/assets/pet/<breed>.png for every breed in `SHEETS`
 * Outputs: mobile/assets/pet/<breed>Lifter.png, <breed>Scholar.png
 *
 * Re-run from the repo root (deterministic, overwrites in place):
 *
 *   node mobile/scripts/buildEvolutionSprites.mjs
 *   node mobile/scripts/buildEvolutionSprites.mjs --preview /some/dir
 *
 * `--preview` additionally writes a base | lifter | scholar contact strip per
 * breed for a handful of representative frames, for eyeballing the result.
 * `SPRITE_DEBUG=1` logs each cell's pose classification.
 * Uses only `pngjs` (a devDependency of `mobile`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.resolve(HERE, '..', 'assets', 'pet');

/** Alpha above which a pixel counts as part of the pet. */
const OPAQUE = 24;

const SHEETS = [
  {
    base: 'bichon',
    columns: 4,
    rows: 11,
    cell: 128,
    preview: [[0, 0], [2, 2], [4, 0], [9, 0], [7, 1], [9, 2]],
  },
  {
    base: 'shiba',
    columns: 4,
    rows: 11,
    cell: 128,
    preview: [[0, 0], [2, 2], [4, 3], [8, 0], [9, 0], [10, 0]],
  },
  {
    base: 'otter',
    columns: 6,
    rows: 10,
    cell: 190,
    preview: [[0, 0], [2, 4], [4, 2], [4, 4], [5, 0], [6, 0], [7, 0], [9, 5]],
  },
  // The pack animals. All 4 columns of 128px cells; only the row count varies.
  // Their sheets have empty trailing cells where a band did not fill its last
  // row, which the per-cell loop already skips.
  { base: 'tabbyCat', columns: 4, rows: 10, cell: 128, preview: [[0, 0], [2, 0], [4, 0], [5, 0], [9, 0]] },
  { base: 'bunny', columns: 4, rows: 7, cell: 128, preview: [[0, 0], [2, 0], [3, 0], [6, 0]] },
  { base: 'fox', columns: 4, rows: 8, cell: 128, preview: [[0, 0], [1, 0], [3, 0], [7, 0]] },
  { base: 'koala', columns: 4, rows: 10, cell: 128, preview: [[0, 0], [2, 0], [4, 0], [6, 0], [9, 0]] },
  { base: 'bear', columns: 4, rows: 8, cell: 128, preview: [[0, 0], [1, 0], [3, 0], [4, 0], [6, 2]] },
  { base: 'axolotl', columns: 4, rows: 9, cell: 128, preview: [[0, 0], [1, 0], [3, 0], [7, 0], [8, 0]] },
  { base: 'dino', columns: 4, rows: 10, cell: 128, preview: [[0, 0], [2, 0], [4, 0], [6, 0], [9, 0]] },
];

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const RED = [0xd8, 0x38, 0x3a];
const RED_EDGE = [0x8e, 0x1f, 0x22];
const RED_HIGHLIGHT = [0xf0, 0x74, 0x72];
const NAVY = [0x1f, 0x2a, 0x5a];
const NAVY_TOP = [0x2f, 0x3f, 0x80];
const NAVY_EDGE = [0x10, 0x16, 0x3a];
const GOLD = [0xe0, 0xb1, 0x3a];
const GOLD_DARK = [0x9c, 0x74, 0x1c];
const COOL = [0x5a, 0x78, 0xc8];

// ---------------------------------------------------------------------------
// PNG + cell helpers
// ---------------------------------------------------------------------------

const readPng = (file) => PNG.sync.read(fs.readFileSync(file));

const writePng = (file, png) => fs.writeFileSync(file, PNG.sync.write(png));

const blankPng = (width, height) => {
  const png = new PNG({ width, height });
  png.data.fill(0);
  return png;
};

/** A square RGBA tile lifted out of a sheet. */
const extractCell = (png, column, row, size) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const src = ((row * size + y) * png.width + column * size) * 4;
    data.set(png.data.subarray(src, src + size * 4), y * size * 4);
  }
  return { size, data };
};

const blitCell = (png, cell, x0, y0, scale = 1) => {
  const { size, data } = cell;
  for (let y = 0; y < size * scale; y += 1) {
    for (let x = 0; x < size * scale; x += 1) {
      const si = ((y / scale) | 0) * size + ((x / scale) | 0);
      const di = ((y0 + y) * png.width + x0 + x) * 4;
      const a = data[si * 4 + 3] / 255;
      if (a === 0) continue;
      for (let c = 0; c < 3; c += 1) {
        png.data[di + c] = Math.round(data[si * 4 + c] * a + png.data[di + c] * (1 - a));
      }
      png.data[di + 3] = 255;
    }
  }
};

const cloneCell = (cell) => ({ size: cell.size, data: new Uint8ClampedArray(cell.data) });

// ---------------------------------------------------------------------------
// Silhouette analysis
// ---------------------------------------------------------------------------

/**
 * The largest 4-connected blob of opaque pixels, with its bounding box. Stars,
 * tears and sparkles are separate small blobs and are ignored by everything that
 * has to find the head.
 */
const largestBlob = (cell) => {
  const { size, data } = cell;
  const n = size * size;
  const labels = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let best = { count: 0, label: -1 };
  let label = 0;
  for (let start = 0; start < n; start += 1) {
    if (labels[start] !== -1 || data[start * 4 + 3] <= OPAQUE) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let count = 0;
    while (head < tail) {
      const i = queue[head++];
      count += 1;
      const x = i % size;
      const y = (i / size) | 0;
      const neighbours = [
        x > 0 ? i - 1 : -1,
        x < size - 1 ? i + 1 : -1,
        y > 0 ? i - size : -1,
        y < size - 1 ? i + size : -1,
      ];
      for (const j of neighbours) {
        if (j >= 0 && labels[j] === -1 && data[j * 4 + 3] > OPAQUE) {
          labels[j] = label;
          queue[tail++] = j;
        }
      }
    }
    if (count > best.count) best = { count, label };
    label += 1;
  }
  if (best.count === 0) return null;

  const mask = new Uint8Array(n);
  let left = size;
  let right = -1;
  let top = size;
  let bottom = -1;
  for (let i = 0; i < n; i += 1) {
    if (labels[i] !== best.label) continue;
    mask[i] = 1;
    const x = i % size;
    const y = (i / size) | 0;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  const bbox = { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
  return { size, mask, bbox, fill: best.count / (bbox.width * bbox.height) };
};

/** Horizontal runs of blob pixels on one row, as [x0, x1] pairs. */
const rowSegments = (blob, y) => {
  const { size, mask } = blob;
  const segments = [];
  let start = -1;
  for (let x = 0; x <= size; x += 1) {
    const on = x < size && mask[y * size + x] === 1;
    if (on && start === -1) start = x;
    if (!on && start !== -1) {
      segments.push([start, x - 1]);
      start = -1;
    }
  }
  return segments;
};

/**
 * The widest run on a row that overlaps the head's x-range, clipped to that range
 * (plus a little slack). The tail tip often rises to head height (cat), and in a
 * leap the tail curl, body and head can share a row (shiba), so "the run under
 * the head" rather than "the whole row" is what keeps a headband off the tail.
 */
const headSegment = (blob, y, hm) => {
  const pad = Math.round(blob.bbox.width * 0.04);
  let best = null;
  for (const seg of rowSegments(blob, y)) {
    if (seg[1] < hm.hx0 - pad || seg[0] > hm.hx1 + pad) continue;
    if (!best || seg[1] - seg[0] > best[1] - best[0]) best = seg;
  }
  if (!best) return null;
  return [Math.max(best[0], hm.hx0 - pad), Math.min(best[1], hm.hx1 + pad)];
};

/**
 * Whether there is a head to hang an accessory on. Flat blobs are collapsed or
 * asleep; a blob that fills most of its box without being taller than wide is a
 * curled-up ball (the cat's and otter's sleep frames), whose top edge is a back,
 * not a head. Measured across every cell of all four sheets: standing poses fill
 * at most ~0.76 of their box, the curled ones 0.77-0.83, and the otter's lying
 * poses sit at ~0.65 tall-to-wide with a 0.72 fill.
 */
const isUpright = (blob) => {
  const { width, height } = blob.bbox;
  const ratio = height / width;
  if (ratio < 0.62) return false;
  if (blob.fill >= 0.77 && ratio < 0.9) return false;
  if (blob.fill >= 0.7 && ratio < 0.7) return false;
  return true;
};

/**
 * Where the head is.
 *
 * The skull is the first row from the top whose widest run is wide enough to be a
 * head rather than an ear tip, tuft or raised tail (a third of the blob), and
 * which sits under the crown — the densest column cluster in the blob's topmost
 * rows — so paws raised beside the head (otter cheer) cannot stand in for it.
 * From there the head's x-range grows downward through the rows that stay
 * head-sized; the row where it suddenly merges into the body or a tail curl is
 * excluded, so a leaping shiba's band does not stretch from tail to nose.
 * `headTop` is where the ears start above the skull. `eyeTop` is the top of the
 * eyes when they are drawn open (see `eyeTopIn`), or null.
 */
const headMetrics = (blob, cell) => {
  const { size, mask, bbox } = blob;
  const { top, height, width } = bbox;
  const minHead = Math.max(3, 0.32 * width);
  const limit = Math.min(bbox.bottom, top + Math.round(height * 0.5));

  // Crown: the heaviest cluster of occupied columns across the topmost rows.
  const crownBottom = Math.min(bbox.bottom, top + Math.max(1, Math.round(height * 0.04)));
  const columnHits = new Int32Array(size);
  for (let y = top; y <= crownBottom; y += 1) {
    for (let x = bbox.left; x <= bbox.right; x += 1) columnHits[x] += mask[y * size + x];
  }
  const clusters = [];
  let current = null;
  let gap = 0;
  for (let x = bbox.left; x <= bbox.right; x += 1) {
    if (columnHits[x] > 0) {
      if (!current) current = { weight: 0, moment: 0 };
      current.weight += columnHits[x];
      current.moment += columnHits[x] * x;
      gap = 0;
    } else if (current && (gap += 1) > Math.max(2, Math.round(width * 0.03))) {
      clusters.push(current);
      current = null;
    }
  }
  if (current) clusters.push(current);
  clusters.sort((a, b) => b.weight - a.weight);
  const crownX = clusters[0].moment / clusters[0].weight;
  const slack = Math.round(width * 0.1);

  const widestOn = (y, nearCrown) => {
    let widest = null;
    for (const seg of rowSegments(blob, y)) {
      if (nearCrown && (seg[1] < crownX - slack || seg[0] > crownX + slack)) continue;
      if (!widest || seg[1] - seg[0] > widest[1] - widest[0]) widest = seg;
    }
    return widest;
  };
  const findSkull = (nearCrown) => {
    for (let y = top; y <= limit; y += 1) {
      const widest = widestOn(y, nearCrown);
      if (widest && widest[1] - widest[0] + 1 >= minHead) return { y, seg: widest };
    }
    return null;
  };
  // Prefer a skull under the crown; a raised tail as the crown (cat leap) finds
  // nothing there and falls back to the plain search.
  const found = findSkull(true) ?? findSkull(false) ?? { y: top, seg: widestOn(top, false) ?? [bbox.left, bbox.right] };
  const headTopRow = found.y;
  const seed = found.seg;

  const seedW = seed[1] - seed[0] + 1;
  let hx0 = seed[0];
  let hx1 = seed[1];
  const growLimit = Math.min(bbox.bottom, headTopRow + Math.round(height * 0.25));
  for (let y = headTopRow; y <= growLimit; y += 1) {
    for (const seg of rowSegments(blob, y)) {
      if (seg[1] < hx0 || seg[0] > hx1) continue;
      if (seg[1] - seg[0] + 1 > 1.8 * seedW) continue;
      hx0 = Math.min(hx0, seg[0]);
      hx1 = Math.max(hx1, seg[1]);
    }
  }

  const inset = Math.round((hx1 - hx0) * 0.15);
  let headTop = headTopRow;
  for (let y = Math.max(top, headTopRow - Math.round(0.2 * height)); y < headTopRow; y += 1) {
    if (rowSegments(blob, y).some((seg) => seg[1] >= hx0 + inset && seg[0] <= hx1 - inset)) {
      headTop = y;
      break;
    }
  }

  const hm = { anchorX: (hx0 + hx1) / 2, headTop, headTopRow, headWidth: hx1 - hx0 + 1, hx0, hx1 };
  hm.eyeTop = eyeTopIn(cell, blob, hm);
  return hm;
};

/**
 * The top row of the eyes, when they are drawn open: the highest solid dark blob
 * inside the head's x-range, below the skull row. A pixel counts only if its whole
 * neighbourhood is dark, which keeps the eyes (solid discs) and drops the outline,
 * closed-eye lines and the mouth (thin lines). The search starts a little under
 * the skull so a dark ear or an ear's outline cannot pass for an eye. Null when
 * nothing qualifies, which is the case for closed eyes and back views.
 */
const eyeTopIn = (cell, blob, hm) => {
  const { size, mask, bbox } = blob;
  const radius = size <= 128 ? 1 : 2;
  const yFrom = hm.headTopRow + Math.round(bbox.height * 0.08);
  const yTo = Math.min(bbox.bottom, hm.headTopRow + Math.round(bbox.height * 0.45));
  const isDark = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    const i = y * size + x;
    if (mask[i] !== 1) return false;
    const o = i * 4;
    if (cell.data[o + 3] < OPAQUE * 4) return false;
    return 0.299 * cell.data[o] + 0.587 * cell.data[o + 1] + 0.114 * cell.data[o + 2] < 75;
  };
  for (let y = yFrom; y <= yTo; y += 1) {
    for (let x = hm.hx0; x <= hm.hx1; x += 1) {
      if (!isDark(x, y)) continue;
      let solid = true;
      for (let dy = -radius; dy <= radius && solid; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isDark(x + dx, y + dy)) {
            solid = false;
            break;
          }
        }
      }
      if (solid) return y - radius;
    }
  }
  return null;
};

/**
 * How solid the pet is drawn, as 0..1: the 90th-percentile alpha of the blob.
 * 1 for every normal cell; ~0.5 for the shiba's fade-out ghost, so the gear drawn
 * on it fades with it instead of floating solid over a translucent dog.
 */
const blobInk = (cell, blob) => {
  const histogram = new Int32Array(256);
  let total = 0;
  for (let i = 0; i < blob.mask.length; i += 1) {
    if (blob.mask[i] !== 1) continue;
    histogram[cell.data[i * 4 + 3]] += 1;
    total += 1;
  }
  let seen = 0;
  for (let a = 0; a < 256; a += 1) {
    seen += histogram[a];
    if (seen >= total * 0.9) return a / 255;
  }
  return 1;
};

const dilate = (blob, radius) => {
  const { size, mask } = blob;
  const out = new Uint8Array(mask);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (mask[y * size + x] !== 1) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) out[ny * size + nx] = 1;
        }
      }
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Pixel ops
// ---------------------------------------------------------------------------

/** Source-over composite of a straight-alpha colour onto one pixel. */
const paint = (cell, x, y, rgb, alpha = 1) => {
  const { size, data } = cell;
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;
  const i = (y * size + x) * 4;
  const da = data[i + 3] / 255;
  const outA = alpha + da * (1 - alpha);
  if (outA === 0) return;
  for (let c = 0; c < 3; c += 1) {
    data[i + c] = Math.round((rgb[c] * alpha + data[i + c] * da * (1 - alpha)) / outA);
  }
  data[i + 3] = Math.round(outA * 255);
};

const alphaAt = (cell, x, y) => {
  if (x < 0 || y < 0 || x >= cell.size || y >= cell.size) return 0;
  return cell.data[(y * cell.size + x) * 4 + 3];
};

const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
};

const hslToRgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return rgb.map((v) => Math.round((v + m) * 255));
};

/** Lifter palette: a touch more saturated and warmer. Whites and greys are left alone. */
const warmTint = (cell) => {
  const { data } = cell;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.1 || l > 0.93) continue;
    const warmer = h > 180 && h < 300 ? h : h - 4;
    const [r, g, b] = hslToRgb(warmer, Math.min(1, s * 1.1 + 0.02), l * 0.985);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
};

/** Scholar palette: mid-tones nudged toward blue. The whiter a pixel, the less it moves. */
const coolTint = (cell) => {
  const { data } = cell;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const min = Math.min(data[i], data[i + 1], data[i + 2]) / 255;
    const whiteness = min * min;
    const f = 0.11 * (1 - whiteness);
    for (let c = 0; c < 3; c += 1) data[i + c] = Math.round(data[i + c] * (1 - f) + COOL[c] * f);
  }
};

/**
 * Horizontal stretch about the blob's centre x. `scaleAt(y)` gives the factor per
 * row so the chest can broaden more than the head. Sampled bilinearly in
 * premultiplied space so the soft-edged sheets do not grow a fringe; the factor is
 * capped so the stretched blob still fits the cell with a pixel to spare.
 */
const widen = (source, blob, scaleAt) => {
  const { size } = source;
  const { left, right } = blob.bbox;
  const cx = (left + right) / 2;
  const roomLeft = (cx - 1) / Math.max(1, cx - left + 0.5);
  const roomRight = (size - 2 - cx) / Math.max(1, right - cx + 0.5);
  const cap = Math.max(1, Math.min(roomLeft, roomRight));

  const out = { size, data: new Uint8ClampedArray(size * size * 4) };
  const src = source.data;
  const sample = (sx, sy, acc) => {
    const x0 = Math.floor(sx);
    const fx = sx - x0;
    const weights = [[x0, 1 - fx], [x0 + 1, fx]];
    acc.fill(0);
    for (const [x, w] of weights) {
      if (w === 0 || x < 0 || x >= size) continue;
      const i = (sy * size + x) * 4;
      const a = src[i + 3] / 255;
      acc[0] += src[i] * a * w;
      acc[1] += src[i + 1] * a * w;
      acc[2] += src[i + 2] * a * w;
      acc[3] += a * w;
    }
  };
  const acc = new Float64Array(4);
  for (let y = 0; y < size; y += 1) {
    const s = Math.min(cap, scaleAt(y));
    for (let x = 0; x < size; x += 1) {
      const sx = cx + (x - cx) / s;
      if (sx < -1 || sx > size) continue;
      sample(sx, y, acc);
      if (acc[3] <= 0) continue;
      const o = (y * size + x) * 4;
      out.data[o] = Math.round(acc[0] / acc[3]);
      out.data[o + 1] = Math.round(acc[1] / acc[3]);
      out.data[o + 2] = Math.round(acc[2] / acc[3]);
      out.data[o + 3] = Math.round(acc[3] * 255);
    }
  }
  return out;
};

const drawThickLine = (cell, x0, y0, x1, y1, rgb, thickness, alphaFn) => {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let t = 0; t < thickness; t += 1) {
      paint(cell, x, y + t, rgb, alphaFn ? alphaFn(x, y + t) : 1);
    }
  }
};

// ---------------------------------------------------------------------------
// Lifter
// ---------------------------------------------------------------------------

const lifterScale = (bbox, upright) => {
  if (!upright) return () => 1.1;
  const { top, height } = bbox;
  return (y) => {
    const t = (y - top) / Math.max(1, height);
    // Bell centred on the chest / shoulders: the head barely grows, the torso does.
    const bump = Math.exp(-(((t - 0.58) / 0.32) ** 2));
    return 1.05 + 0.16 * bump;
  };
};

const drawHeadband = (cell, blob, hm, lw, ink) => {
  const { height, width } = blob.bbox;
  const bandH = Math.max(3, Math.round(0.09 * height));
  // On the forehead: a tenth of the pet below the skull row (so under the ear
  // base on the shiba and cat), lifted if that would reach open eyes.
  let bandTop = Math.round(hm.headTopRow + 0.1 * height);
  if (hm.eyeTop !== null) {
    const gapAboveEyes = Math.max(1, Math.round(0.012 * height));
    bandTop = Math.min(bandTop, hm.eyeTop - gapAboveEyes - bandH);
  }
  bandTop = Math.max(bandTop, hm.headTopRow - Math.round(0.02 * height));
  const edgeRows = Math.max(1, Math.round(lw / 2));
  let knotSeg = null;
  const knotRow = bandTop + Math.floor(bandH / 2);

  for (let y = bandTop; y < bandTop + bandH; y += 1) {
    const seg = headSegment(blob, y, hm);
    if (!seg) continue;
    if (y === knotRow) knotSeg = seg;
    const isEdge = y - bandTop < edgeRows || bandTop + bandH - 1 - y < edgeRows;
    const segW = seg[1] - seg[0] + 1;
    const hi0 = seg[0] + Math.round(segW * 0.12);
    const hi1 = seg[0] + Math.round(segW * 0.4);
    for (let x = seg[0]; x <= seg[1]; x += 1) {
      const a = alphaAt(cell, x, y) / 255;
      let rgb = RED;
      if (isEdge || x === seg[0] || x === seg[1]) rgb = RED_EDGE;
      else if (y - bandTop === edgeRows && x >= hi0 && x <= hi1) rgb = RED_HIGHLIGHT;
      paint(cell, x, y, rgb, a);
    }
  }

  // Knot tails, poking out on the side that faces the body/back of the head.
  if (knotSeg) {
    const centre = (blob.bbox.left + blob.bbox.right) / 2;
    const towardsRight = hm.anchorX <= centre + width * 0.04;
    const len = Math.max(4, Math.round(0.1 * width));
    const startX = towardsRight ? knotSeg[1] + 1 : knotSeg[0] - 1;
    const dir = towardsRight ? 1 : -1;
    const thick = Math.max(2, lw);
    // Two tails: one trailing nearly level, one dropping.
    drawThickLine(cell, startX, knotRow - 1, startX + dir * len, knotRow, RED, thick, () => ink);
    drawThickLine(cell, startX, knotRow, startX + dir * Math.round(len * 0.7), knotRow + Math.round(len * 0.7), RED, thick, () => ink);
    // Dark outline along the outer edge of each tail.
    drawThickLine(cell, startX, knotRow - 2, startX + dir * len, knotRow - 1, RED_EDGE, 1, () => ink);
    drawThickLine(cell, startX + dir, knotRow + thick, startX + dir * (Math.round(len * 0.7) + 1), knotRow + Math.round(len * 0.7) + thick, RED_EDGE, 1, () => ink);
    // A small dark knot where the tails meet the band.
    for (let t = -1; t <= thick; t += 1) paint(cell, startX - dir, knotRow + t, RED_EDGE, ink);
  }
};

const buildLifter = (cell, blob, lw) => {
  const upright = isUpright(blob);
  const widened = widen(cell, blob, lifterScale(blob.bbox, upright));
  warmTint(widened);
  const newBlob = largestBlob(widened);
  if (upright && newBlob) drawHeadband(widened, newBlob, headMetrics(newBlob, widened), lw, blobInk(widened, newBlob));
  return widened;
};

// ---------------------------------------------------------------------------
// Scholar
// ---------------------------------------------------------------------------

const drawMortarboard = (cell, blob, hm, lw, ink) => {
  const { height, width } = blob.bbox;
  const put = (x, y, rgb, alpha = 1) => paint(cell, x, y, rgb, alpha * ink);
  const cx = Math.round(hm.anchorX);
  const boardH = Math.max(5, Math.round(0.09 * height));
  const halfW = Math.round(Math.min(Math.max(1.02 * hm.headWidth, 0.3 * width), 0.64 * width) / 2);
  // The board's front edge sits a few pixels into the crown, so the skull cap
  // under it overlaps the head instead of hovering over the ear tips.
  const bottomY = Math.round(hm.headTopRow + 0.05 * height);
  const topY = bottomY - boardH + 1;

  // Skull cap: a block under the board, only where the head actually is.
  const near = dilate(blob, Math.max(2, lw + 1));
  const capHalf = Math.max(2, Math.round(0.5 * hm.headWidth / 2));
  const capH = Math.max(3, Math.round(0.08 * height));
  for (let y = bottomY + 1; y <= bottomY + capH; y += 1) {
    for (let x = cx - capHalf; x <= cx + capHalf; x += 1) {
      if (x < 0 || y < 0 || x >= cell.size || y >= cell.size) continue;
      if (near[y * cell.size + x] !== 1) continue;
      const edge = x - (cx - capHalf) < lw || cx + capHalf - x < lw || bottomY + capH - y < lw;
      put(x, y, edge ? NAVY_EDGE : NAVY, 1);
    }
  }

  // Board: a tapered top face over a straight front edge, then outlined.
  const inBoard = (x, y) => {
    if (y < topY || y > bottomY) return false;
    const t = (y - topY) / Math.max(1, boardH - 1);
    const taper = t < 0.55 ? 0.62 + 0.38 * (t / 0.55) : 1;
    return Math.abs(x - cx) <= halfW * taper;
  };
  for (let y = topY - 1; y <= bottomY + 1; y += 1) {
    for (let x = cx - halfW - 1; x <= cx + halfW + 1; x += 1) {
      if (!inBoard(x, y)) continue;
      const t = (y - topY) / Math.max(1, boardH - 1);
      const boundary = !inBoard(x - 1, y) || !inBoard(x + 1, y) || !inBoard(x, y - 1) || !inBoard(x, y + 1);
      const rgb = boundary ? NAVY_EDGE : t < 0.55 ? NAVY_TOP : NAVY;
      put(x, y, rgb, 1);
    }
  }
  if (lw > 1) {
    // Thicker sheets get a second outline row on the bottom so the edge reads.
    for (let x = cx - halfW; x <= cx + halfW; x += 1) put(x, bottomY, NAVY_EDGE, 1);
  }

  // Tassel from one corner, dropping down the side of the head.
  const towardsRight = hm.anchorX >= (blob.bbox.left + blob.bbox.right) / 2 - width * 0.04;
  const cornerX = towardsRight ? cx + halfW - lw : cx - halfW + lw;
  const tasselTop = topY + Math.round(boardH * 0.45);
  const tasselLen = Math.max(5, Math.round(0.12 * height));
  const tasselW = Math.max(1, Math.round(lw * 0.75));
  const swing = towardsRight ? 1 : -1;
  for (let i = 0; i <= tasselLen; i += 1) {
    const y = tasselTop + i;
    const x = cornerX + (i > boardH ? swing : 0);
    for (let t = 0; t < tasselW; t += 1) put(x + t, y, i % 3 === 2 ? GOLD_DARK : GOLD, 1);
  }
  const knobY = tasselTop + tasselLen;
  const knobX = cornerX + swing;
  const knobR = Math.max(1, lw);
  for (let dy = -knobR; dy <= knobR + 1; dy += 1) {
    for (let dx = -knobR; dx <= knobR + (tasselW - 1); dx += 1) {
      const edge = Math.abs(dy) === knobR || dy === knobR + 1 || dx === -knobR || dx === knobR + (tasselW - 1);
      put(knobX + dx, knobY + dy, edge ? GOLD_DARK : GOLD, 1);
    }
  }

  // Button on the top centre.
  const bw = Math.max(1, lw);
  for (let dx = -bw; dx <= bw; dx += 1) {
    put(cx + dx, topY, GOLD, 1);
    if (lw > 1) put(cx + dx, topY + 1, GOLD_DARK, 1);
  }
};

const buildScholar = (cell, blob, lw) => {
  const out = cloneCell(cell);
  coolTint(out);
  if (isUpright(blob)) drawMortarboard(out, blob, headMetrics(blob, cell), lw, blobInk(cell, blob));
  return out;
};

// ---------------------------------------------------------------------------
// Sheet driver
// ---------------------------------------------------------------------------

const buildSheet = (sheet, previewDir) => {
  const basePath = path.join(ASSET_DIR, `${sheet.base}.png`);
  const png = readPng(basePath);
  const { columns, rows, cell: size } = sheet;
  if (png.width !== columns * size || png.height !== rows * size) {
    throw new Error(`${sheet.base}: expected ${columns * size}x${rows * size}, got ${png.width}x${png.height}`);
  }
  // Outline weight: 1px on the 128px sheets, 2px on the ~190px ones.
  const lw = Math.max(1, Math.round(size / 100));

  const lifter = blankPng(png.width, png.height);
  const scholar = blankPng(png.width, png.height);
  const cells = new Map();

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = extractCell(png, column, row, size);
      const blob = largestBlob(cell);
      if (process.env.SPRITE_DEBUG && blob) console.log(`${sheet.base} [${row},${column}] ${isUpright(blob) ? 'upright' : 'lying'}`);
      let lifterCell = cell;
      let scholarCell = cell;
      if (blob) {
        lifterCell = buildLifter(cell, blob, lw);
        scholarCell = buildScholar(cell, blob, lw);
      }
      for (const [target, source] of [[lifter, lifterCell], [scholar, scholarCell]]) {
        for (let y = 0; y < size; y += 1) {
          const dst = ((row * size + y) * target.width + column * size) * 4;
          target.data.set(source.data.subarray(y * size * 4, (y + 1) * size * 4), dst);
        }
      }
      cells.set(`${row},${column}`, { base: cell, lifter: lifterCell, scholar: scholarCell });
    }
  }

  const lifterPath = path.join(ASSET_DIR, `${sheet.base}Lifter.png`);
  const scholarPath = path.join(ASSET_DIR, `${sheet.base}Scholar.png`);
  writePng(lifterPath, lifter);
  writePng(scholarPath, scholar);
  console.log(`${sheet.base}: wrote ${path.basename(lifterPath)} and ${path.basename(scholarPath)} (${png.width}x${png.height})`);

  if (previewDir) writePreview(sheet, cells, previewDir);
};

const writePreview = (sheet, cells, previewDir) => {
  const scale = sheet.cell <= 128 ? 2 : 1;
  const tile = sheet.cell * scale;
  const gutter = 6;
  const frames = sheet.preview;
  const png = blankPng(3 * tile + 4 * gutter, frames.length * (tile + gutter) + gutter);
  // Mid-grey ground so both the white bichon and dark outlines stay visible.
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0xb8;
    png.data[i + 1] = 0xbc;
    png.data[i + 2] = 0xc4;
    png.data[i + 3] = 255;
  }
  frames.forEach(([row, column], index) => {
    const entry = cells.get(`${row},${column}`);
    if (!entry) return;
    const y0 = gutter + index * (tile + gutter);
    blitCell(png, entry.base, gutter, y0, scale);
    blitCell(png, entry.lifter, 2 * gutter + tile, y0, scale);
    blitCell(png, entry.scholar, 3 * gutter + 2 * tile, y0, scale);
  });
  fs.mkdirSync(previewDir, { recursive: true });
  const file = path.join(previewDir, `${sheet.base}-evolutions-preview.png`);
  writePng(file, png);
  console.log(`${sheet.base}: preview ${file}`);
};

const main = () => {
  const args = process.argv.slice(2);
  const previewIndex = args.indexOf('--preview');
  const previewDir = previewIndex !== -1 ? path.resolve(HERE, args[previewIndex + 1] ?? 'preview') : null;
  for (const sheet of SHEETS) buildSheet(sheet, previewDir);
};

main();
