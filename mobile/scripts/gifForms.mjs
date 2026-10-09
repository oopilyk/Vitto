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

/** Per pet: the box, and the key (otters match the base otter's). */
const PETS = {
  tabbyCat: { box: { x: -14, y: -4, size: 795 }, key: { fringePasses: 4 } },
  dino: { box: { x: -4, y: -16, size: 779 }, key: { fringePasses: 4 } },
  fox: { box: { x: -8, y: -34, size: 783 }, key: { fringePasses: 4 } },
  koala: { box: { x: -43, y: -116, size: 856 }, key: { fringePasses: 4 } },
  // The base otter's own box: its forms stand exactly as it does.
  otter: { box: { x: 25, y: 15, size: 720 }, key: { greyFringe: true, fringePasses: 4 } },
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
  foxScholar: { key: { clearCreases: true, pocketArea: 40, pocketReach: 140 }, cutOutPockets: ['idle', 'celebrating', 'run', 'sad', 'dying'] },
};
const keyFor = (name, pet) => ({ ...PETS[pet].key, ...EXTRA_KEY[name]?.key });

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
