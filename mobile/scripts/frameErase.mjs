/**
 * Hand-checked clean-up of white matte that keyBackground.mjs leaves behind,
 * for a form whose leftovers no general rule can tell from its own art.
 *
 * The fox lifter is the case: the matte trapped beside the tail and in the
 * creases of the neck and legs is the same off-white as its grin and the
 * glints in its eyes, and touches cream fur the way the grin does. So instead
 * of a rule, every frame of every clip was looked at, and what was found to be
 * background is listed in `data/<form>Erase.json`:
 *
 *   edge   a pale patch within this many pixels of the transparency is matte
 *          left on the outline (art never sits there: the eye glints, teeth
 *          and nose shine are walled in by the face). Per form, all clips.
 *   clips  per source clip (the GIF's name), a list of { box, frames?, note }:
 *          every pale patch whose centre lies in box [x0, y0, x1, y1] (source
 *          pixels) goes, on the listed source frame indices, or on every frame.
 *   keep   per source clip, boxes whose patches `edge` must leave alone.
 *   paleMin  optional, raises PALE_MIN for a white pet (the bichon), whose
 *          shading at ~205-215 would join a gap to the fur round it.
 *   paleChroma  optional, replaces PALE_CHROMA. It and paleMin can also be
 *          set per rule, for that rule's box alone: the shibas' GIFs quantise
 *          some matte to their cream (~249,235,216), and leave slivers of grey
 *          blend (~170-195) on the outline, so tight boxes round hand-checked
 *          patches walled off from the fur take a looser test.
 *
 * A pale patch is a connected run of near-neutral light pixels, so it stops at
 * the outline and at the cream fur (which is far from neutral). What goes is
 * made transparent and painted black, as keyBackground does, and then the
 * pale-grey blend round it (`rim` passes) goes too, which would otherwise
 * show as a light ring on the dark room.
 *
 * Runs after keyBackground, on the full-size source frame, from both
 * buildLifterVideos.mjs and buildVideoSheet.mjs, so the clips and the sheet
 * agree. Forms without a data file are left as they are.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
/** What counts as matte: light, and within this much of neutral. */
const PALE_MIN = 205;
const PALE_CHROMA = 24;
/** The blend round it: a muted pixel at least this light. */
const RIM_LUMA = 110;
const RIM_CHROMA = 28;

const cache = new Map();
const load = (form) => {
  if (!cache.has(form)) {
    const file = path.join(DATA, `${form}Erase.json`);
    cache.set(form, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  }
  return cache.get(form);
};

/**
 * For buildLifterVideos.mjs: the source GIF frame index of an extracted
 * frame file (`0001.png` is the first kept), given the clip's `frames` range
 * and `skip`. The GIFs are 6fps, so ffmpeg's fps=6 keeps every frame.
 */
export const sourceFrame = (file, range, skip) => {
  let k = Number.parseInt(file, 10) - 1;
  for (let n = range ? range[0] : 0; ; n += 1) {
    if (skip && n >= skip[0] && n <= skip[1]) continue;
    if (k === 0) return n;
    k -= 1;
  }
};

const inBox =([x0, y0, x1, y1], x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/**
 * The ring of stars the otter lifter's dizzy GIF draws over its head. They sat
 * still while it swayed, so they read as stuck on rather than orbiting, and the
 * spiral eyes say dizzy on their own. Only the forms listed in STARLESS lose
 * them; every other form keeps its stars. Every star is its own island of opaque
 * pixels, apart from the body, and mostly yellow (its fill) inside a gold
 * outline, so an island that is small and at least a fifth yellow goes whole,
 * with the soft edge round it. No pet's own art is a detached yellow island.
 */
const STARLESS = new Set(['otterLifter']);
const STAR_MAX_AREA = 20000;
const isStarYellow = (r, g, b) => r > 190 && g > 170 && b < 140 && r - b > 90 && g > r * 0.72;
export const dropStars = (png) => {
  const { width: W, height: H, data } = png;
  const solid = (p) => data[(p << 2) + 3] >= 128;
  const seen = new Uint8Array(W * H);
  const gone = [];
  for (let start = 0; start < W * H; start += 1) {
    if (seen[start] || !solid(start)) continue;
    const island = [start];
    seen[start] = 1;
    let yellow = 0;
    for (let k = 0; k < island.length && island.length <= STAR_MAX_AREA; k += 1) {
      const p = island[k], x = p % W, y = (p / W) | 0, i = p << 2;
      if (isStarYellow(data[i], data[i + 1], data[i + 2])) yellow += 1;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!seen[n] && solid(n)) { seen[n] = 1; island.push(n); }
      }
    }
    if (island.length > STAR_MAX_AREA || yellow * 5 < island.length) continue;
    for (const p of island) { data.fill(0, p << 2, (p << 2) + 4); gone.push(p); }
  }
  // The faint edge just outside the island.
  let ring = gone;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = [];
    for (const p of ring) {
      const x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx, a = data[(n << 2) + 3];
        if (a > 0 && a < 128) { data.fill(0, n << 2, (n << 2) + 4); next.push(n); }
      }
    }
    ring = next;
  }
  return png;
};

/**
 * Erases the listed leftovers from one keyed frame (a pngjs PNG, in place).
 * `clip` is the source clip and `frame` the index of the frame in its GIF.
 * Returns the PNG.
 */
export const applyFrameErase = (form, clip, frame, png) => {
  if (STARLESS.has(form) && /dizzy/.test(clip)) dropStars(png);
  const spec = load(form);
  if (!spec) return png;
  const rules = (spec.clips?.[clip] ?? []).filter((rule) => !rule.frames || rule.frames.includes(frame));
  // A rule with its own `paleMin`/`paleChroma` is swept on its own.
  const own = (rule) => rule.paleMin !== undefined || rule.paleChroma !== undefined;
  const boxes = rules.filter((rule) => !own(rule)).map((rule) => rule.box);
  const keep = spec.keep?.[clip] ?? [];
  const edge = spec.edge ?? 0;
  if (!rules.length && !edge) return png;

  const { width: W, height: H, data } = png;
  const chroma = (i) => Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
  const paleTo = (most, least = spec.paleMin ?? PALE_MIN) => (p) => {
    const i = p << 2;
    return data[i + 3] !== 0 && Math.min(data[i], data[i + 1], data[i + 2]) >= least && chroma(i) <= most;
  };
  const clear = (p) => data.fill(0, p << 2, (p << 2) + 4);

  // Distance (8-connected, up to `edge`) from the transparency.
  let near = null;
  if (edge) {
    near = new Uint8Array(W * H);
    let ring = [];
    for (let p = 0; p < W * H; p += 1) if (data[(p << 2) + 3] === 0) { near[p] = 1; ring.push(p); }
    for (let step = 0; step < edge; step += 1) {
      const next = [];
      for (const p of ring) {
        const x = p % W, y = (p / W) | 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (!near[n]) { near[n] = 1; next.push(n); }
        }
      }
      ring = next;
    }
  }

  const erased = [];
  // One sweep per pale test: the form's, then each rule's own `paleMin`/`paleChroma`
  // (only its boxes, never `edge`).
  const sweep = (pale, boxes, edge) => {
  const seen = new Uint8Array(W * H);
  for (let start = 0; start < W * H; start += 1) {
    if (seen[start] || !pale(start)) continue;
    const patch = [start];
    seen[start] = 1;
    let sx = 0, sy = 0, touches = false;
    for (let k = 0; k < patch.length; k += 1) {
      const p = patch[k], x = p % W, y = (p / W) | 0;
      sx += x; sy += y;
      if (near?.[p]) touches = true;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!seen[n] && pale(n)) { seen[n] = 1; patch.push(n); }
      }
    }
    const cx = sx / patch.length, cy = sy / patch.length;
    const listed = boxes.some((box) => inBox(box, cx, cy));
    const onEdge = edge && touches && !keep.some((box) => inBox(box, cx, cy));
    if (!listed && !onEdge) continue;
    for (const p of patch) { clear(p); erased.push(p); }
  }
  };
  sweep(paleTo(spec.paleChroma ?? PALE_CHROMA), boxes, true);
  const test = (rule) => `${rule.paleChroma ?? spec.paleChroma ?? PALE_CHROMA},${rule.paleMin ?? spec.paleMin ?? PALE_MIN}`;
  for (const key of new Set(rules.filter(own).map(test))) {
    const [most, least] = key.split(',').map(Number);
    sweep(paleTo(most, least), rules.filter((rule) => own(rule) && test(rule) === key).map((rule) => rule.box), false);
  }

  // The blend round what went.
  let ring = erased;
  for (let pass = 0; pass < (spec.rim ?? 2); pass += 1) {
    const next = [];
    for (const p of ring) {
      const x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx, i = n << 2;
        if (data[i + 3] === 0) continue;
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma >= RIM_LUMA && chroma(i) <= RIM_CHROMA) { clear(n); next.push(n); }
      }
    }
    ring = next;
  }
  return png;
};
