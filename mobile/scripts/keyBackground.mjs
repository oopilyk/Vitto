/**
 * Keys the flat background out of one rendered frame (a pngjs PNG, in place):
 * every pixel reachable from the border without crossing the art goes
 * transparent. Shared by the lifter video and sheet builders so the two agree.
 *
 * Keyed pixels are also painted black. They are invisible either way, but
 * downscaling and HEVC's half-resolution colour both blend a pixel with its
 * neighbours, and an off-white neighbour comes back as a pale halo on the dark
 * room; a black one disappears into the outline.
 */

/** Source pixels of pale edge peeled off the outline, and how pale counts. */
const FRINGE_LUMA_DEFAULT = 140;
/** The white a pre-cut frame (GIF) was matted against. */
const MATTE = [250, 250, 250];
/** How far in from a pre-cut frame's transparency its white matte reaches. */
const MATTE_RIM = 4;
/** Opaque blobs smaller than this, cut off from the pet, are compression noise. */
const SPECK_AREA = 24;
/** What `greyFringe` counts as grey: this little colour, and lighter than the outline. */
const GREY_CHROMA = 40;
const GREY_LUMA = 80;
/** A cool, muted edge pixel above this is a blend, not the outline's near-black. */
const COOL_LUMA = 30;
/** A pale patch `pocketReach` keys: at most this big, and this light. */
const PALE_PATCH = 40;
const PALE_LUMA = 170;

/**
 * @param {{ tolerance?: number, fringePasses?: number, pocketArea?: number }} options
 *   `pocketArea`: also key enclosed background-coloured regions (the gap
 *   between an arm and the body) of at least this many pixels. Leave it unset
 *   for pets whose own colour is close to the background's, like the bichon's
 *   white fur, where a "pocket" can be the pet.
 *   `pocketReach`: also key enclosed background-coloured regions of ANY size
 *   that come within this many pixels of the outside (the gap inside the dizzy
 *   ring of stars, a notch where an arm meets the body). Glints deep in the art
 *   are further in than that and survive.
 *   `greyFringe`: peel washed-out grey edge pixels as well as pale ones: the
 *   blend of a dark outline into a white background comes out blue-grey, which
 *   the luma test keeps but a dark room shows as a pale rim. Only for pets whose
 *   own colours are strong (the bears); the bichon's white fur is exactly that
 *   grey and would be peeled with it.
 *   `closeGaps`: fill see-through slivers narrower than twice this many pixels
 *   that lie between two dark outlines (under an arm hanging close to the
 *   body) with the outline's colour. On screen they are a pixel or two wide
 *   and read as a white line, not as a gap.
 *   `clearCreases`: background trapped deep in a crease (a white slit up
 *   under an arm) is made see-through rather than painted over, so it reads
 *   as the same gap the rest of the armpit is. See fillCreaseSpecks.
 */
export const keyBackground = (png, { tolerance = 24, fringePasses = 3, fringeLuma = FRINGE_LUMA_DEFAULT, pocketArea, pocketReach, greyFringe = false, closeGaps = 0, clearCreases = false } = {}) => {
  const { width, height, data } = png;
  // A frame that arrives already cut out (a GIF) has hard 1-bit alpha with the
  // generator's white matte left on the pixels next to it. Its transparent
  // pixels seed the fill, and the matte is what counts as background colour.
  let cutOut = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 0) { cutOut = true; break; }
  const corner = cutOut ? MATTE : [data[0], data[1], data[2]];
  const isBackground = (flat) => {
    if (data[(flat << 2) + 3] === 0) return true;
    const i = flat << 2;
    return (
      Math.abs(data[i] - corner[0]) <= tolerance &&
      Math.abs(data[i + 1] - corner[1]) <= tolerance &&
      Math.abs(data[i + 2] - corner[2]) <= tolerance
    );
  };
  const neighbours = (flat) => {
    const x = flat % width;
    return [
      x > 0 ? flat - 1 : -1,
      x < width - 1 ? flat + 1 : -1,
      flat >= width ? flat - width : -1,
      flat < width * (height - 1) ? flat + width : -1,
    ].filter((n) => n >= 0);
  };

  const diagonals = (flat) => {
    const x = flat % width;
    const up = flat >= width, down = flat < width * (height - 1);
    return [
      up && x > 0 ? flat - width - 1 : -1,
      up && x < width - 1 ? flat - width + 1 : -1,
      down && x > 0 ? flat + width - 1 : -1,
      down && x < width - 1 ? flat + width + 1 : -1,
    ].filter((n) => n >= 0);
  };

  const outside = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x += 1) queue.push(x, width * (height - 1) + x);
  for (let y = 0; y < height; y += 1) queue.push(width * y, width * y + width - 1);
  if (cutOut) {
    // The matte is a thin rim. Past it, white is the art's own (paper, a
    // diploma), so the fill only walks MATTE_RIM pixels in from the cut-out.
    const depth = new Int32Array(width * height).fill(-1);
    const ring = [];
    for (let flat = 0; flat < width * height; flat += 1) {
      if (data[(flat << 2) + 3] === 0) { outside[flat] = 1; depth[flat] = 0; ring.push(flat); }
    }
    for (let k = 0; k < ring.length; k += 1) {
      const flat = ring[k];
      if (depth[flat] >= MATTE_RIM) continue;
      for (const n of neighbours(flat)) {
        if (depth[n] >= 0 || !isBackground(n)) continue;
        depth[n] = depth[flat] + 1;
        outside[n] = 1;
        ring.push(n);
      }
    }
    queue.length = 0;
  }
  while (queue.length) {
    const flat = queue.pop();
    if (outside[flat] || !isBackground(flat)) continue;
    outside[flat] = 1;
    queue.push(...neighbours(flat));
  }

  // Background the border can't reach. Small ones are highlights in the art
  // (the bear's are all under ~50px); big ones are background showing through.
  // A pre-cut frame's enclosed background is already transparent; anything
  // white left inside its outlines is art (the scholar's paper).
  if (!cutOut && (pocketArea || pocketReach)) {
    // How far each unkeyed pixel is from the outside, out to `pocketReach`.
    const reach = new Int32Array(width * height).fill(-1);
    if (pocketReach) {
      const ring = [];
      for (let flat = 0; flat < outside.length; flat += 1) if (outside[flat]) { reach[flat] = 0; ring.push(flat); }
      for (let k = 0; k < ring.length; k += 1) {
        const flat = ring[k];
        if (reach[flat] >= pocketReach) continue;
        for (const n of neighbours(flat)) if (reach[n] < 0) { reach[n] = reach[flat] + 1; ring.push(n); }
      }
    }
    const seen = new Uint8Array(width * height);
    for (let start = 0; start < outside.length; start += 1) {
      if (outside[start] || seen[start] || !isBackground(start)) continue;
      const region = [start];
      seen[start] = 1;
      for (let k = 0; k < region.length; k += 1) {
        for (const n of neighbours(region[k])) {
          if (!outside[n] && !seen[n] && isBackground(n)) {
            seen[n] = 1;
            region.push(n);
          }
        }
      }
      const big = pocketArea && region.length >= pocketArea;
      const near = pocketReach && region.some((flat) => reach[flat] >= 0);
      if (big || near) for (const flat of region) outside[flat] = 1;
    }
    // Background trapped in a notch is often blended off-colour (light grey
    // rather than the background's white), so it matches neither test above.
    // Small pale patches near the outside go too; a big one near the edge (the
    // highlight along the dizzy ring) is art.
    if (pocketReach && !cutOut) {
      const isPale = (flat) => {
        const i = flat << 2;
        const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
        return chroma < GREY_CHROMA && 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] > PALE_LUMA;
      };
      const paleSeen = new Uint8Array(width * height);
      for (let start = 0; start < outside.length; start += 1) {
        if (outside[start] || paleSeen[start] || reach[start] < 0 || !isPale(start)) continue;
        const patch = [start];
        paleSeen[start] = 1;
        for (let k = 0; k < patch.length && patch.length <= PALE_PATCH; k += 1) {
          for (const n of neighbours(patch[k])) {
            if (!outside[n] && !paleSeen[n] && isPale(n)) {
              paleSeen[n] = 1;
              patch.push(n);
            }
          }
        }
        if (patch.length <= PALE_PATCH) for (const flat of patch) outside[flat] = 1;
      }
    }
  }

  // The video is soft, so between the background and the dark outline sits a
  // band of blended pale pixels that read as a white halo on a dark stage. Peel
  // them off; the outline itself is dark, so the peel stops there.
  for (let pass = 0; pass < fringePasses; pass += 1) {
    const peel = [];
    for (let flat = 0; flat < outside.length; flat += 1) {
      // With `greyFringe`, a pixel wedged diagonally into a corner of the
      // background counts as touching it too.
      const touching = greyFringe ? [...neighbours(flat), ...diagonals(flat)] : neighbours(flat);
      if (outside[flat] || !touching.some((n) => outside[n])) continue;
      const i = flat << 2;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      // The bears' outline is warm and near black; the white background blended
      // into it comes out a cool purple-grey that no part of the art uses.
      const coolBlend = data[i + 2] >= data[i] && chroma < GREY_CHROMA && luma > COOL_LUMA;
      if (luma > fringeLuma || (greyFringe && ((chroma < GREY_CHROMA && luma > GREY_LUMA) || coolBlend))) peel.push(flat);
    }
    for (const flat of peel) outside[flat] = 1;
  }

  // Compression leaves 1-2px grey specks just past the outline, some loose and
  // some hanging off it. An art pixel here is ~6 source pixels wide, so trim
  // anything thinner than 3px (an opening: erode, then grow back only what
  // survived), then drop what is still floating free and tiny.
  const eroded = new Uint8Array(width * height);
  for (let flat = 0; flat < outside.length; flat += 1) {
    eroded[flat] = !outside[flat] && neighbours(flat).length === 4 && neighbours(flat).every((n) => !outside[n]) ? 1 : 0;
  }
  for (let flat = 0; flat < outside.length; flat += 1) {
    if (!outside[flat] && !eroded[flat] && !neighbours(flat).some((n) => eroded[n])) outside[flat] = 1;
  }
  const visited = new Uint8Array(width * height);
  for (let start = 0; start < outside.length; start += 1) {
    if (outside[start] || visited[start]) continue;
    const blob = [start];
    visited[start] = 1;
    for (let k = 0; k < blob.length; k += 1) {
      for (const n of neighbours(blob[k])) {
        if (!outside[n] && !visited[n]) {
          visited[n] = 1;
          blob.push(n);
        }
      }
    }
    if (blob.length < SPECK_AREA) for (const flat of blob) outside[flat] = 1;
  }

  if (closeGaps) {
    closeOutlineGaps(png, outside, closeGaps);
    fillCreaseSpecks(png, outside);
  }
  if (clearCreases) fillCreaseSpecks(png, outside, { clear: true });

  for (let flat = 0; flat < outside.length; flat += 1) {
    if (!outside[flat]) continue;
    const i = flat << 2;
    data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
  }
  return png;
};

/** Luma below which an opaque pixel counts as outline, for `closeGaps`. */
const OUTLINE_LUMA = 70;

/**
 * A morphological close of the dark-outline mask: grow it by `radius`, shrink
 * it back. Whatever that adds lies in a gap narrower than 2 x radius with
 * outline on both sides; the transparent part of it is painted in, opaque, the
 * average outline colour of the frame. Wider gaps (between the legs, under a
 * raised arm) shrink back open.
 */
const closeOutlineGaps = (png, outside, radius) => {
  const { width, height, data } = png;
  const size = width * height;
  // Only the pet's own outline: its largest connected piece. A spark or star
  // floating beside it has a dark edge too, and closing that would paint over
  // its see-through gaps.
  const body = new Uint8Array(size);
  const seen = new Uint8Array(size);
  let best = [];
  for (let start = 0; start < size; start += 1) {
    if (outside[start] || seen[start]) continue;
    const piece = [start];
    seen[start] = 1;
    for (let k = 0; k < piece.length; k += 1) {
      const flat = piece[k];
      const x = flat % width;
      for (const nb of [x > 0 ? flat - 1 : -1, x < width - 1 ? flat + 1 : -1, flat - width, flat + width]) {
        if (nb >= 0 && nb < size && !outside[nb] && !seen[nb]) {
          seen[nb] = 1;
          piece.push(nb);
        }
      }
    }
    if (piece.length > best.length) best = piece;
  }
  for (const flat of best) body[flat] = 1;

  const dark = new Uint8Array(size);
  let r = 0, g = 0, b = 0, n = 0;
  for (let flat = 0; flat < size; flat += 1) {
    if (!body[flat]) continue;
    const i = flat << 2;
    if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < OUTLINE_LUMA) {
      dark[flat] = 1;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
  }
  if (!n) return;
  // Square structuring element, run as separable row then column passes.
  const pass = (src, keep) => {
    const rows = new Uint8Array(size);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let hit = !keep;
        for (let d = -radius; d <= radius; d += 1) {
          const xx = x + d;
          const v = xx >= 0 && xx < width ? src[y * width + xx] : 0;
          if (keep ? v : !v) { hit = keep; break; }
        }
        rows[y * width + x] = hit ? 1 : 0;
      }
    }
    const out = new Uint8Array(size);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let hit = !keep;
        for (let d = -radius; d <= radius; d += 1) {
          const yy = y + d;
          const v = yy >= 0 && yy < height ? rows[yy * width + x] : 0;
          if (keep ? v : !v) { hit = keep; break; }
        }
        out[y * width + x] = hit ? 1 : 0;
      }
    }
    return out;
  };
  // keep=true: dilate (any set neighbour). keep=false: erode (any unset neighbour clears).
  const closed = pass(pass(dark, true), false);
  const fill = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  for (let flat = 0; flat < size; flat += 1) {
    if (!closed[flat] || !outside[flat]) continue;
    outside[flat] = 0;
    const i = flat << 2;
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = 255;
  }
};

/** How far into the art, along dark outline, a crease is followed. */
const CREASE_REACH = 40;
/** Pale patches bigger than this in a crease are art, not background. */
const CREASE_SPECK = 400;
/** ...and no wider than this across. */
const CREASE_WIDTH = 12;

/**
 * Background showing through deep in a crease (where an arm hangs against the
 * body) comes out as a white speck walled in by outline, too far in for the
 * edge passes to reach. What sets it apart from a highlight in the art is that
 * its outline runs unbroken out to the edge of the pet: follow dark pixels in
 * from the outside for CREASE_REACH, and paint any small pale patch touching
 * that path with the outline colour (or, with `clear`, key it). An eye glint sits in a pupil ringed by
 * fur, and the medal's shine in gold, so neither is reached.
 */
const fillCreaseSpecks = (png, outside, { clear = false } = {}) => {
  const { width, height, data } = png;
  const size = width * height;
  const luma = (flat) => {
    const i = flat << 2;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  const chroma = (flat) => {
    const i = flat << 2;
    return Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
  };
  const around = (flat) => {
    const x = flat % width;
    const out = [];
    for (const dy of [-width, 0, width]) {
      for (const dx of [-1, 0, 1]) {
        if (!dy && !dx) continue;
        if ((dx < 0 && x === 0) || (dx > 0 && x === width - 1)) continue;
        const n = flat + dy + dx;
        if (n >= 0 && n < size) out.push(n);
      }
    }
    return out;
  };
  const isDark = (flat) => !outside[flat] && luma(flat) < OUTLINE_LUMA;
  const isPale = (flat) => !outside[flat] && chroma(flat) < 40 && luma(flat) > 150;

  // Dark pixels reachable from the outside through dark pixels, within reach.
  const depth = new Int32Array(size).fill(-1);
  const queue = [];
  let r = 0, g = 0, b = 0, n = 0;
  for (let flat = 0; flat < size; flat += 1) {
    if (isDark(flat) && around(flat).some((nb) => outside[nb])) {
      depth[flat] = 0;
      queue.push(flat);
    }
  }
  for (let k = 0; k < queue.length; k += 1) {
    const flat = queue[k];
    const i = flat << 2;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    if (depth[flat] >= CREASE_REACH) continue;
    for (const nb of around(flat)) {
      if (depth[nb] < 0 && isDark(nb)) {
        depth[nb] = depth[flat] + 1;
        queue.push(nb);
      }
    }
  }
  if (!n) return;
  const fill = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];

  const seen = new Uint8Array(size);
  for (let start = 0; start < size; start += 1) {
    if (seen[start] || !isPale(start)) continue;
    const patch = [start];
    seen[start] = 1;
    let touches = false;
    for (let k = 0; k < patch.length; k += 1) {
      for (const nb of around(patch[k])) {
        if (depth[nb] >= 0) touches = true;
        if (!seen[nb] && isPale(nb)) {
          seen[nb] = 1;
          patch.push(nb);
        }
      }
    }
    if (!touches || patch.length > CREASE_SPECK) continue;
    // A slit, not a shape: background up a crease is a few pixels across;
    // paper or a highlight that happens to meet the outline is not.
    let x0 = width, x1 = 0, y0 = height, y1 = 0;
    for (const flat of patch) {
      const x = flat % width, y = (flat / width) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (Math.min(x1 - x0, y1 - y0) + 1 > CREASE_WIDTH) continue;
    if (clear) {
      for (const flat of patch) outside[flat] = 1;
      continue;
    }
    for (const flat of patch) {
      const i = flat << 2;
      data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2];
    }
  }
};
