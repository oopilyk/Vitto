/**
 * Builds every app-icon asset from one square source image.
 *
 *   node scripts/buildAppIcons.mjs assets/source/logo.png
 *
 * Re-run it whenever the logo changes. The sizes and the alpha rules below are
 * not preferences, they are what each platform refuses to work without:
 *
 *   icon.png            1024, NO alpha   iOS rejects an icon with transparency,
 *                                        and renders a black square for one.
 *   splash-icon.png     1024, alpha      sits on the splash background colour.
 *   favicon.png         48, alpha
 *   android-icon-*      512 / 432, alpha adaptive icon, see the safe zone below.
 *
 * The background is keyed out by flooding inward from the border rather than by
 * matching a colour everywhere, so white that is part of the ARTWORK -- the
 * eye highlights, the pale vein down each leaf -- is kept. A global key would
 * punch holes through all three.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const work = fs.mkdtempSync(path.join(root, '.icons-'));

/** The app's paper colour. Also `expo.backgroundColor`, so the icon matches the app it opens. */
const CREAM = [245, 242, 235];
/** A pixel this close to the border colour, reached from the border, is background. */
const TOLERANCE = 10;

const read = (file) => PNG.sync.read(fs.readFileSync(file));
const write = (png, file) => fs.writeFileSync(file, PNG.sync.write(png));
/**
 * Writes RGB with no alpha channel at all. An opaque canvas is not enough for
 * iOS: it rejects an icon that merely HAS an alpha channel, whatever is in it,
 * and a build that slips through renders the icon as a black square.
 */
const writeOpaque = (png, file) => fs.writeFileSync(file, PNG.sync.write(png, { colorType: 2 }));
/** `-Z` fits the longest side, preserving aspect; every canvas here is already square. */
const resize = (from, to, size) => execFileSync('sips', ['-Z', String(size), from, '--out', to], { stdio: 'ignore' });

/** Background pixels, found by flooding inward from every border pixel that looks like the border. */
const keyBackground = (png) => {
  const { width, height, data } = png;
  const at = (x, y) => (width * y + x) << 2;
  const corner = [data[0], data[1], data[2]];
  const looksLikeBackground = (i) =>
    Math.abs(data[i] - corner[0]) <= TOLERANCE &&
    Math.abs(data[i + 1] - corner[1]) <= TOLERANCE &&
    Math.abs(data[i + 2] - corner[2]) <= TOLERANCE;

  const outside = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x += 1) { queue.push([x, 0], [x, height - 1]); }
  for (let y = 0; y < height; y += 1) { queue.push([0, y], [width - 1, y]); }

  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const flat = width * y + x;
    if (outside[flat]) continue;
    if (!looksLikeBackground(at(x, y))) continue;
    outside[flat] = 1;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (let i = 0; i < outside.length; i += 1) if (outside[i]) data[(i << 2) + 3] = 0;
  return png;
};

/** Tight bounds of everything still opaque. */
const contentBounds = (png) => {
  const { width, height, data } = png;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[((width * y + x) << 2) + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
};

/** Crops to the content and pads back out to a square, so every later resize is uniform. */
const squareCrop = (png) => {
  const { minX, minY, maxX, maxY } = contentBounds(png);
  const side = Math.max(maxX - minX + 1, maxY - minY + 1);
  const out = new PNG({ width: side, height: side, fill: true });
  PNG.bitblt(
    png, out, minX, minY, maxX - minX + 1, maxY - minY + 1,
    Math.floor((side - (maxX - minX + 1)) / 2),
    Math.floor((side - (maxY - minY + 1)) / 2),
  );
  return out;
};

/**
 * Draws `art` centred on a `size` canvas, scaled to `fill` of it.
 * `background` null leaves the surround transparent.
 */
const place = (artFile, size, fill, background) => {
  const inner = Math.round(size * fill);
  const scaled = path.join(work, `scaled-${size}-${inner}.png`);
  resize(artFile, scaled, inner);
  const art = read(scaled);
  const out = new PNG({ width: size, height: size, fill: true });
  if (background) {
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = background[0]; out.data[i + 1] = background[1];
      out.data[i + 2] = background[2]; out.data[i + 3] = 255;
    }
  }
  const offset = Math.floor((size - art.width) / 2);
  // bitblt copies alpha verbatim, which would punch holes in an opaque
  // background, so a backed canvas is composited by hand.
  if (background) {
    for (let y = 0; y < art.height; y += 1) {
      for (let x = 0; x < art.width; x += 1) {
        const from = (art.width * y + x) << 2;
        const alpha = art.data[from + 3] / 255;
        if (alpha === 0) continue;
        const to = (out.width * (y + offset) + (x + offset)) << 2;
        for (let c = 0; c < 3; c += 1) {
          out.data[to + c] = Math.round(art.data[from + c] * alpha + out.data[to + c] * (1 - alpha));
        }
      }
    }
  } else {
    PNG.bitblt(art, out, 0, 0, art.width, art.height, offset, offset);
  }
  return out;
};

/** Everything opaque, flattened to one colour: what Android themed icons want. */
const silhouette = (png, colour) => {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue;
    png.data[i] = colour[0]; png.data[i + 1] = colour[1]; png.data[i + 2] = colour[2];
    png.data[i + 3] = 255;
  }
  return png;
};

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('usage: node scripts/buildAppIcons.mjs <source.png>');
  process.exit(1);
}

try {
  const art = path.join(work, 'art.png');
  write(squareCrop(keyBackground(read(source))), art);

  // iOS: opaque, on the app's own paper colour. Filling ~84% leaves the breathing
  // room every other icon on a home screen has.
  writeOpaque(place(art, 1024, 0.84, CREAM), path.join(assets, 'icon.png'));

  // Splash and favicon keep their transparency.
  write(place(art, 1024, 0.62, null), path.join(assets, 'splash-icon.png'));
  write(place(art, 48, 0.92, null), path.join(assets, 'favicon.png'));

  // Android adaptive icons are masked to a shape the manufacturer chooses, and
  // only the centre 66% is guaranteed to survive it. Anything outside that can
  // be cropped off, so the art is drawn at 62% and the background carries the rest.
  write(place(art, 512, 0.62, null), path.join(assets, 'android-icon-foreground.png'));
  const background = new PNG({ width: 512, height: 512, fill: true });
  for (let i = 0; i < background.data.length; i += 4) {
    background.data[i] = CREAM[0]; background.data[i + 1] = CREAM[1];
    background.data[i + 2] = CREAM[2]; background.data[i + 3] = 255;
  }
  write(background, path.join(assets, 'android-icon-background.png'));
  write(silhouette(place(art, 432, 0.62, null), [38, 49, 45]), path.join(assets, 'android-icon-monochrome.png'));

  console.log('wrote icon, splash-icon, favicon and the three android icons to assets/');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
