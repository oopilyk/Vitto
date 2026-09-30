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
/** Opaque blobs smaller than this, cut off from the pet, are compression noise. */
const SPECK_AREA = 24;

/**
 * @param {{ tolerance?: number, fringePasses?: number, pocketArea?: number }} options
 *   `pocketArea`: also key enclosed background-coloured regions (the gap
 *   between an arm and the body) of at least this many pixels. Leave it unset
 *   for pets whose own colour is close to the background's, like the bichon's
 *   white fur, where a "pocket" can be the pet.
 */
export const keyBackground = (png, { tolerance = 24, fringePasses = 3, fringeLuma = FRINGE_LUMA_DEFAULT, pocketArea } = {}) => {
  const { width, height, data } = png;
  const corner = [data[0], data[1], data[2]];
  const isBackground = (flat) => {
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

  const outside = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x += 1) queue.push(x, width * (height - 1) + x);
  for (let y = 0; y < height; y += 1) queue.push(width * y, width * y + width - 1);
  while (queue.length) {
    const flat = queue.pop();
    if (outside[flat] || !isBackground(flat)) continue;
    outside[flat] = 1;
    queue.push(...neighbours(flat));
  }

  // Background the border can't reach. Small ones are highlights in the art
  // (the bear's are all under ~50px); big ones are background showing through.
  if (pocketArea) {
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
      if (region.length >= pocketArea) for (const flat of region) outside[flat] = 1;
    }
  }

  // The video is soft, so between the background and the dark outline sits a
  // band of blended pale pixels that read as a white halo on a dark stage. Peel
  // them off; the outline itself is dark, so the peel stops there.
  for (let pass = 0; pass < fringePasses; pass += 1) {
    const peel = [];
    for (let flat = 0; flat < outside.length; flat += 1) {
      if (outside[flat] || !neighbours(flat).some((n) => outside[n])) continue;
      const i = flat << 2;
      if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] > fringeLuma) peel.push(flat);
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

  for (let flat = 0; flat < outside.length; flat += 1) {
    if (!outside[flat]) continue;
    const i = flat << 2;
    data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
  }
  return png;
};
