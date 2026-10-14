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
 * outside goes, which fur walled in by outline never is (taking the pale
 * blend round it too, which showed as a white notch in the outline).
 *
 * Two more are walled in, so not open: the patch between the flexing arm and
 * the head (~850px, the fur's grey), and specks between the claws of a raised
 * paw. What sets both apart from the fur's light patches (the ears, the belly)
 * is that outline rings them all round, where those meet darker fur; the
 * teeth are ringed too, but sit in the red mouth.
 */
const MOUTH = (r, g, b) => r > 150 && r - g > 60;
const KOALA_CREASES = [
  { reach: 8, paleLuma: 230 },
  { area: 1500, width: 40, thick: 12, paleLuma: 230 },
  { area: 1500, width: 40, reach: 200, paleLuma: 200, open: true, rim: 2 },
  // Pale notches in the outline (under a foot, beside an arm) that the peel
  // stops short of: tiny, and blended down to ~190.
  { area: 60, width: 12, reach: 200, paleLuma: 185, open: true },
];
/** The walled-in patches, as solid as `thick` (the slit under the runner's arm is 9px). */
const koalaWalled = (thick) => ({ area: 1500, width: 50, thick, reach: 200, paleLuma: 200, walled: 0.9, unlessNear: MOUTH, nearReach: 6, rim: 2 });
const KOALA_CLAWS = { reach: 40, paleLuma: 230, walled: 0.9, unlessNear: MOUTH, nearReach: 6, rim: 3 };
// The dizzy clips' spiral eyes are white strokes ringed by outline too, up to
// ~9px wide: there only a solid patch goes, and no claw specks.
const KOALA_KEY = {
  fringePasses: 4,
  clearCreases: [...KOALA_CREASES, koalaWalled(9), KOALA_CLAWS],
  byClip: { dizzy: { clearCreases: [...KOALA_CREASES, koalaWalled(12)] } },
};

/**
 * A key may carry `byClip`: per source clip, options that replace its own for
 * that clip. This resolves it for one clip.
 */
export const keyForClip = ({ byClip, ...key } = {}, clip) => ({ ...key, ...byClip?.[clip] });

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
  koala: { box: { x: -43, y: -116, size: 856 }, key: KOALA_KEY },
  // The base otter's own box: its forms stand exactly as it does.
  otter: { box: { x: 25, y: 15, size: 720 }, key: OTTER_KEY },
  // The dogs' lifter and scholar match their runner (buildVideoSheet.mjs), so
  // take its key. The shiba's are drawn its size with the feet 3px lower
  // (y=605, not 602), so its box moves down 3px; the bichon scholar's is
  // drawn ~7% bigger (399px tall against 374) with the feet at y=608, not 593,
  // so its box grows to match, keeping the runner's floor line and centre.
  shiba: { box: { x: -13, y: -23, size: 796 }, key: { greyFringe: true, fringePasses: 4 } },
  bichon: { box: { x: 67, y: 59, size: 639 }, key: { fringePasses: 6 } },
};

/** [source folder, pet, idle clip, run loop, dying flat from]. */
const FORMS = {
  tabbyCatLifter: ['cat-lifter', 'tabbyCat', 'idle-flex', [4, 24], 14],
  tabbyCatRunner: ['cat-runner', 'tabbyCat', 'idle', [1, 24], 18],
  tabbyCatScholar: ['cat-scholar', 'tabbyCat', 'idle', [2, 19], 19],
  dinoLifter: ['dino-lifter', 'dino', 'idle', [3, 17], 18],
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
  // A stride is 4 frames and drifts; frame 0 is the same as 24, so 0-23 joins.
  shibaLifter: ['shiba-lifter', 'shiba', 'idle-flex', [0, 23], 21],
  shibaScholar: ['shiba-scholar', 'shiba', 'idle', [6, 21], 15],
  bichonScholar: ['bichon-scholar', 'bichon', 'idle', [7, 21], 14],
};

/**
 * The dogs' GIFs leave their off-white matte (~249,241,232 on the shibas)
 * between the wagging tail and the back or bandana, and between the legs. Solid
 * patches with outline all round go; the shibas' cream (~250,235,215) meets
 * orange fur, not outline. Shared with the shiba runner (buildVideoSheet.mjs,
 * buildLifterVideos.mjs). `rim`: the grey blend round a gap (an art pixel is
 * 3px, so one step of it) showed as a white ring round the hole.
 */
export const SHIBA_GAPS = { area: 3000, width: 70, thick: 9, paleLuma: 200, walled: 0.95, rim: 3 };
/**
 * The bichons' matte is their fur's own white, so only shape tells: a gap
 * walled by outline all round and open to the outside (the slot between the
 * tail and the back, the notch between the legs), up to 2,000px. The scholar's
 * outline is a soft grey (~75), so lighter still counts as outline. Its
 * enclosed pockets (the tail pressed to the back) go too when solid, but not
 * beside the book, bow or star, whose pages and shine are as white.
 */
const BICHON_ART = (r, g, b) => (r > 80 && r - g > 50 && r - b > 40) || (b > 60 && b - r > 35 && b - g > 20) || (r > 180 && g > 140 && b < 120 && r - b > 80);
export const BICHON_GAP = { area: 2000, width: 70, thick: 9, paleLuma: 200, open: true, walled: 0.95, outlineLuma: 110 };
const BICHON_GAPS = [BICHON_GAP, { ...BICHON_GAP, open: false, thick: 12, unlessNear: BICHON_ART, nearReach: 6 }];

/**
 * The runners' keys, shared by buildVideoSheet.mjs and buildLifterVideos.mjs.
 * The bichon runner's dashed outline lets the outside in to its fur at a pixel
 * or two, so its gap must meet the outside along 5 or more, and not beside the
 * headband (or a star), above which the fur is walled in all the same. The
 * shiba runner's dizzy face and tired muzzle are white ringed by outline too.
 */
export const BICHON_RUNNER_KEY = { fringePasses: 6, clearCreases: { ...BICHON_GAP, open: 5, unlessNear: (r, g, b) => r > 140 && r - b > 90, nearReach: 6 } };
export const SHIBA_RUNNER_KEY = { greyFringe: true, fringePasses: 4, clearCreases: SHIBA_GAPS, byClip: { dizzy: { clearCreases: false }, tired: { clearCreases: false } } };

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
  // Not the lifter's sad: its grey muzzle under the nose is ringed the same way.
  shibaLifter: { key: { clearCreases: SHIBA_GAPS, byClip: { sad: { clearCreases: false } } } },
  shibaScholar: { key: { clearCreases: SHIBA_GAPS } },
  bichonScholar: { key: { clearCreases: BICHON_GAPS } },
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

/**
 * Pauses in an idle clip that blinks too often, for buildLifterVideos.mjs:
 * each source frame in `at` is shown `frames` times (12 is 2s at 6fps).
 *
 * The axolotls (and the cat and koala lifters) blink on nearly every bob of
 * their idle, a blink every second or so, which looped reads as a pet that
 * will not stop blinking. Slowing the clip would slow the bob too, so instead
 * the clip holds still, eyes open, for 2s before each blink that came less
 * than 2s after the last one: bob and blink, pause, bob and blink. The held
 * frame is the open-eyed one just before the blink, at the bob's resting
 * height (standing tall, for the lifters), never mid-flex. Only frames are
 * repeated, none dropped, so the loop joins as before. Measured off the GIFs:
 * the eyes are shut on
 *
 *   axolotlLifter   2, 6-7, 11, 15-16, 20-21, 25-26 of each 31-frame bob
 *                   (0-30, 31-61, 62-92), and 97-98 going into the flex
 *   axolotlRunner   2-3, 7-8, 12-13, 17-18, 22-23, 27-28
 *   axolotlScholar  2-3, 6-9, 14-15, 19-21, 24-27
 *   koalaLifter     10-13 and 16-18 of each 31-frame bob: only the second of
 *                   that pair needs the pause
 *   tabbyCatLifter  2-7, 12-17, 22-27 of each 31-frame bob, and 97-99 going
 *                   into the flex (118-120 coming out is 3s after the last)
 *
 * The cat and koala runners and scholars blink once a loop, 3-4s apart
 * already, so play as they are.
 */
const everyBob = (frames) => [0, 31, 62].flatMap((bob) => frames.map((frame) => bob + frame));
export const IDLE_HOLDS = {
  axolotlLifter: { at: [...everyBob([0, 4, 9, 14, 18, 23]), 96], frames: 12 },
  axolotlRunner: { at: [1, 6, 11, 16, 21, 26], frames: 12 },
  axolotlScholar: { at: [1, 5, 13, 18, 23], frames: 12 },
  koalaLifter: { at: everyBob([15]), frames: 12 },
  tabbyCatLifter: { at: [...everyBob([1, 11, 21]), 96], frames: 12 },
};

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
          IDLE_HOLDS[name] ? { name: idle, hold: IDLE_HOLDS[name] } : idle,
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
