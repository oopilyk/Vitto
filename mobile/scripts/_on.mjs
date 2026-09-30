import fs from 'node:fs'; import { PNG } from 'pngjs';
const [,, src, out] = process.argv;
const a = PNG.sync.read(fs.readFileSync(src));
// Composite on the dark purple of the night room, then crop to the bear and blow up 2x.
const bg = [70, 60, 110];
const x0 = 200, y0 = 200, w = 420, h = 420;
const o = new PNG({ width: w * 2, height: h * 2 });
for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) {
  const si = ((a.width * (y0 + (y >> 1))) + (x0 + (x >> 1))) << 2, di = ((o.width * y) + x) << 2;
  const al = a.data[si + 3] / 255;
  for (let c = 0; c < 3; c++) o.data[di + c] = Math.round(a.data[si + c] * al + bg[c] * (1 - al));
  o.data[di + 3] = 255;
}
fs.writeFileSync(out, PNG.sync.write(o));
