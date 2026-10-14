/**
 * The evolved forms that arrived as one generated set: every form a GIF per
 * clip, all named alike (idle or idle-flex, celebrating, run, dizzy, sad,
 * dying) and drawn to the same timing at 6fps. So rather than a hand-written
 * entry each, they share one shape here, and buildVideoSheet.mjs and
 * buildLifterVideos.mjs both expand it.
 *
 * Per form, measured off its GIFs:
 *   run   the loop: first and last frame of the stride, chosen so the last
 *         looks like the frame before the first (the loop does not hitch)
 *   flat  the first frame of the dying clip from which it lies still
 *
 * Per pet, one box for all three forms: the square of the 768px frame that
 * becomes one cell. Each form stands 400-430px tall in its GIFs; the box makes
 * that the base sheet's height with the feet on its floor line, so evolving
 * does not resize the pet, and every clip's widest and highest frame fits.
 */

/** `count` frame indices spread evenly from `from` to `to`. */
const spread = (from, to, count) => Array.from({ length: count }, (_, i) => Math.round(from + ((to - from) * i) / (count - 1)));

/**
 * The koala's GIFs leave matte white wedged between an arm and the head or
 * body, and under the stars. Its own fur is a light grey (~216) the crease
 * test would take for white, so only near-white (the matte, ~240) counts; and
 * where a clip's matte came out the fur's own grey, only a wedge open to the
 * outside goes, which fur walled in by outline never is.
 */
const KOALA_CREASES = [
  { reach: 8, paleLuma: 230 },
  { area: 1500, width: 40, thick: 12, paleLuma: 230 },
  { area: 1500, width: 40, reach: 200, paleLuma: 200, open: true },
];

/**
 * The otters' dizzy GIFs leave a ~2,000px patch of matte between the raised
 * arm and the tail. Their cream belly is pale too, so only near-white counts,
 * and the grey blend round the patch is taken after it (`rim`).
 * Shared with the base otter in buildVideoSheet.mjs and buildLifterVideos.mjs.
 */
export const OTTER_KEY = { greyFringe: true, fringePasses: 4, clearCreases: { area: 3000, width: 60, thick: 12, reach: 200, paleLuma: 235, rim: 3 } };

/**
 * The bunny runner's and scholar's dizzy GIFs fill the inside of the ring of
 * stars with white, either side of the head. Their fur is an off-white
 * (~230) and the fill ~249, so only the brightest white counts.
 */
export const BUNNY_RING_KEY = { clearCreases: { area: 3000, width: 80, thick: 8, reach: 200, paleLuma: 243, rim: 3 } };

/** Per pet: the box, and the key (otters match the base otter's). */
const PETS = {
  tabbyCat: { box: { x: -14, y: -4, size: 795 }, key: { fringePasses: 4 } },
  dino: { box: { x: -4, y: -16, size: 779 }, key: { fringePasses: 4 } },
  fox: { box: { x: -8, y: -34, size: 783 }, key: { fringePasses: 4 } },
  koala: { box: { x: -43, y: -116, size: 856 }, key: { fringePasses: 4, clearCreases: KOALA_CREASES } },
  // The base otter's own box: its forms stand exactly as it does.
  otter: { box: { x: 25, y: 15, size: 720 }, key: OTTER_KEY },
};

/** [source folder, pet, idle clip, run loop, dying flat from]. */
const FORMS = {
  tabbyCatLifter: ['cat-lifter', 'tabbyCat', 'idle-flex', [1, 23], 18],
  tabbyCatRunner: ['cat-runner', 'tabbyCat', 'idle', [1, 24], 18],
  tabbyCatScholar: ['cat-scholar', 'tabbyCat', 'idle', [2, 19], 19],
  dinoLifter: ['dino-lifter', 'dino', 'idle-flex', [3, 17], 18],
  dinoRunner: ['dino-runner', 'dino', 'idle', [4, 23], 22],
  dinoScholar: ['dino-scholar', 'dino', 'idle', [5, 25], 20],
  foxLifter: ['fox-lifter', 'fox', 'idle-flex', [8, 25], 21],
  foxRunner: ['fox-runner', 'fox', 'idle', [3, 29], 20],
  foxScholar: ['fox-scholar', 'fox', 'idle', [6, 23], 20],
  koalaLifter: ['koala-lifter', 'koala', 'idle-flex', [3, 25], 20],
  koalaRunner: ['koala-runner', 'koala', 'idle', [1, 30], 22],
  koalaScholar: ['koala-scholar', 'koala', 'idle', [4, 18], 19],
  otterLifter: ['otter-lifter', 'otter', 'idle-flex', [6, 22], 19],
  otterRunner: ['otter-runner', 'otter', 'idle', [8, 24], 20],
  otterScholar: ['otter-scholar', 'otter', 'idle', [3, 27], 18],
};

/**
 * Extra keying for a form whose GIFs left background behind inside the art.
 *
 * The fox scholar's has white matte trapped where its tail meets its body (a
 * patch of ~1,000px beside the scarf) and in thin creases behind its head:
 * `clearCreases` takes the creases, and cutting out pockets with a long reach
 * takes the patch, which sits too deep in the art for the default. Not the
 * dizzy clip: there the same reach would take its white spiral eyes.
 */
const EXTRA_KEY = {
  // The lifter and runner have the same patch beside the tail (up to ~2,400px,
  // in most clips), and more between the legs and under a raised arm, but the
  // scholar's long-reach pockets would take the lifter's grin and the dizzy
  // eyes. Walled in by outline, they go as one big solid crease, followed
  // along the outline however far in it sits; the grin is as solid, but sits
  // in the cream muzzle, which background never touches.
  foxLifter: { key: { clearCreases: { area: 3000, width: 60, thick: 12, reach: 200, unlessNear: (r, g, b) => r > 215 && g > 190 && b > 130 && b < 185 && r - b > 45 } } },
  foxRunner: { key: { clearCreases: { area: 3000, width: 60, thick: 12, reach: 200, unlessNear: (r, g, b) => r > 215 && g > 190 && b > 130 && b < 185 && r - b > 45 } } },
  foxScholar: { key: { clearCreases: true, pocketArea: 40, pocketReach: 140 }, cutOutPockets: ['idle', 'celebrating', 'run', 'sad', 'dying'] },
};
const keyFor = (name, pet) => ({ ...PETS[pet].key, ...EXTRA_KEY[name]?.key });

/**
 * The axolotl forms' key, shared by buildVideoSheet.mjs and buildLifterVideos.mjs.
 *
 * Their GIFs leave the white matte trapped wherever the art closes round it:
 * a patch of ~700px between the frills and the tail, under the head (white on
 * screen in nearly every clip), and specks in the notches between frill
 * branches and between the legs. Both are walled in by outline that runs out
 * to the edge, so they go as creases: first the specks, with the outline
 * followed only 8px in, which stops short of the X eyes in the face; then the
 * big patch, which is solid, where the spiral and X eyes are strokes too thin
 * to hold a 12px square.
 */
const AXOLOTL_CREASES = [{ reach: 8 }, { area: 1500, width: 40, thick: 12 }];
/** The scholar's book has white pages inside a red cover, against the same outline. */
const BOOK = (r, g, b) => r > 70 && r > 2.2 * g && r > 2.2 * b;
export const AXOLOTL_KEY = {
  axolotlLifter: { fringePasses: 4, clearCreases: AXOLOTL_CREASES },
  axolotlRunner: { fringePasses: 4, clearCreases: AXOLOTL_CREASES },
  axolotlScholar: { fringePasses: 4, clearCreases: AXOLOTL_CREASES.map((pass) => ({ ...pass, unlessNear: BOOK })) },
};

/** For buildVideoSheet.mjs: each form's sheet, in the standard seven bands. */
export const gifFormSheets = () =>
  Object.fromEntries(
    Object.entries(FORMS).map(([name, [source, pet, idle, run, flat]]) => [
      name,
      {
        source,
        output: `${name}.png`,
        box: PETS[pet].box,
        key: keyFor(name, pet),
        ...(EXTRA_KEY[name]?.cutOutPockets ? { cutOutPockets: EXTRA_KEY[name].cutOutPockets } : {}),
        band: {
          // The flex comes late in a lifter's long idle; the sheet keeps the standing part.
          idle: [idle, idle === 'idle-flex' ? spread(0, 88, 12) : spread(1, 23, 12)],
          cheer: ['celebrating', spread(7, 18, 12)],
          move: ['run', spread(run[0], run[0] + 5, 6)],
          rest: ['dying', spread(flat, 30, 8)],
          unwell: ['dizzy', spread(4, 25, 8)],
          sad: ['sad', spread(6, 27, 8)],
          // Ends lying still: the last cell is the one HOLDS_LAST_FRAME parks on.
          faint: ['dying', spread(6, flat + 1, 8)],
        },
      },
    ]),
  );

/** For buildLifterVideos.mjs: each form's clips. */
export const gifFormClips = () =>
  Object.fromEntries(
    Object.entries(FORMS).map(([name, [source, pet, idle, run, flat]]) => [
      name,
      {
        source,
        output: name,
        key: keyFor(name, pet),
        ...(EXTRA_KEY[name]?.cutOutPockets ? { cutOutPockets: EXTRA_KEY[name].cutOutPockets } : {}),
        clips: [
          idle,
          'celebrating',
          { name: 'run', frames: run },
          // From once the stars are up, so the loop never stands it back up straight.
          { name: 'dizzy', frames: [3, 30] },
          'sad',
          'dying',
          { name: 'lie', from: 'dying', frames: [flat, 30] },
        ],
      },
    ]),
  );
