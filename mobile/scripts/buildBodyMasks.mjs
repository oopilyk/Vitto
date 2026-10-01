/**
 * Builds the strength map's body art from the four illustrations in
 * assets/source/body (male/female, front/back):
 *
 *   assets/body/<view>.png               the body, background made transparent
 *   assets/body/masks/<view>-<group>.png one muscle group, white on transparent
 *
 *   node scripts/buildBodyMasks.mjs
 *
 * Each illustration draws its muscles as light-grey segments outlined in white,
 * so a segment is a connected run of muscle-grey pixels. A group is the union of
 * the segments named below -- by label (the segment's index in scan order, as
 * printed by the --labels run) or, where labels crowd, by a point inside it.
 * The app stacks a group's mask over the body and tints it by rank.
 *
 *   node scripts/buildBodyMasks.mjs --labels   prints each view's segment ids
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/source/body');
const out = path.join(root, 'assets/body');

/** Segments per muscle group. Numbers are segment ids; [x, y] pairs are points inside a segment. */
const GROUPS = {
  maleFront: {
    chest: [258, 261],
    shoulders: [220, 225, 245, 254],
    biceps: [420, 417],
    upperBack: [115, 74, 72, 112],
    quads: [1854, 1859, 2013, 2018, 2158, 2149],
  },
  maleBack: {
    shoulders: [249, 255],
    upperBack: [79, 80, 175, 176, 405, 408, 571, 573, 629, 630, 868, 880],
    triceps: [645, 647, 748, 746],
    lowerBack: [[330, 400], [356, 400], 1670, 1671],
    glutes: [2128, 2131, 1953, 1958],
    hamstrings: [2959, 2961, 3039, 3051],
    quads: [2767, 2753],
  },
  femaleFront: {
    chest: [289, 293],
    shoulders: [230, 233],
    biceps: [456, 457],
    upperBack: [108, 112, 161, 159],
    quads: [1795, 1799, 1969, 1963, 2589, 2590, 2679, 2681],
  },
  femaleBack: {
    shoulders: [250, 253],
    upperBack: [123, 125, 340, 345, 393, 400, 717, 712],
    triceps: [540, 653, 779, 787],
    lowerBack: [[332, 400], [356, 400], 1359, 1369],
    glutes: [1889, 1894, 1772, 1778],
    hamstrings: [2752, 2757, 2709, 2712, 3004, 3007],
    quads: [2450, 2452],
  },
};

/** Muscle fill is a light grey; white lines and the darker head/hands bound it. */
const isMuscle = (data, q) => {
  const i = q * 4;
  const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return luma >= 160 && luma <= 238;
};

const segment = (png) => {
  const { width: W, height: H, data } = png;
  const label = new Int32Array(W * H).fill(-1);
  let next = 0;
  for (let s = 0; s < W * H; s += 1) {
    if (label[s] >= 0 || !isMuscle(data, s)) continue;
    const id = next++;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const q = stack.pop();
      const x = q % W;
      for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, q - W, q + W]) {
        if (r >= 0 && r < W * H && label[r] < 0 && isMuscle(data, r)) {
          label[r] = id;
          stack.push(r);
        }
      }
    }
  }
  return label;
};

/** The near-white around the body, reached from the edge, made transparent. */
const clearBackground = (png) => {
  const { width: W, height: H, data } = png;
  const out = new PNG({ width: W, height: H });
  data.copy(out.data);
  const isWhite = (q) => data[q * 4] > 240 && data[q * 4 + 1] > 240 && data[q * 4 + 2] > 240;
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x += 1) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y += 1) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const q = stack.pop();
    if (seen[q] || !isWhite(q)) continue;
    seen[q] = 1;
    out.data[q * 4 + 3] = 0;
    const x = q % W;
    if (x > 0) stack.push(q - 1);
    if (x < W - 1) stack.push(q + 1);
    if (q >= W) stack.push(q - W);
    if (q < W * (H - 1)) stack.push(q + W);
  }
  return out;
};

fs.mkdirSync(path.join(out, 'masks'), { recursive: true });
for (const [view, groups] of Object.entries(GROUPS)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(source, `${view}.png`)));
  const label = segment(png);
  if (process.argv.includes('--labels')) {
    const sizes = new Map();
    for (const id of label) if (id >= 0) sizes.set(id, (sizes.get(id) ?? 0) + 1);
    console.log(view, [...sizes].filter(([, n]) => n >= 150).map(([id]) => id).join(' '));
    continue;
  }
  fs.writeFileSync(path.join(out, `${view}.png`), PNG.sync.write(clearBackground(png)));
  for (const [group, picks] of Object.entries(groups)) {
    const ids = new Set(picks.map((pick) => (Array.isArray(pick) ? label[pick[1] * png.width + pick[0]] : pick)));
    if (ids.has(-1)) throw new Error(`${view} ${group}: a point is not inside a muscle`);
    const mask = new PNG({ width: png.width, height: png.height });
    let painted = 0;
    for (let q = 0; q < label.length; q += 1) {
      if (!ids.has(label[q])) continue;
      const i = q * 4;
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = mask.data[i + 3] = 255;
      painted += 1;
    }
    if (!painted) throw new Error(`${view} ${group}: matched no segment`);
    fs.writeFileSync(path.join(out, 'masks', `${view}-${group}.png`), PNG.sync.write(mask));
  }
  console.log(`wrote ${view}: ${Object.keys(groups).join(', ')}`);
}
