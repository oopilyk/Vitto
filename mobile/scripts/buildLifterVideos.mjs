/**
 * Makes the transparent playback copies of a lifter's animation clips.
 *
 *   node scripts/buildLifterVideos.mjs bichon
 *   node scripts/buildLifterVideos.mjs bear
 *   node scripts/buildLifterVideos.mjs bearRunner
 *   node scripts/buildLifterVideos.mjs otter
 *
 * The clips in `assets/source/video/<pet>-lifter/` are played as-is by
 * `PetVideo` — every frame, at their own frame rate, at full size. The only
 * thing this changes is the background: the clips were rendered on a flat
 * off-white, which would put the dog in a white square on the green stage, so
 * that colour is made transparent and each clip is re-encoded twice, because
 * no one format plays transparent everywhere:
 *
 *   .mov   HEVC with alpha — iOS (AVPlayer) and Safari
 *   .webm  VP9 with alpha  — Chrome, Firefox, Edge (the Expo web build)
 *
 * The source files are never modified.
 *
 * The background is keyed by flooding inward from the frame border, so the
 * white fur INSIDE the dark outline survives even though it is nearly the
 * background's colour. Needs macOS: the alpha encoder is `avconvert`'s.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { fillBehindGaps, fillHoles, keyBackground } from './keyBackground.mjs';
import { applyFrameErase, sourceFrame } from './frameErase.mjs';
import { AXOLOTL_KEY, BICHON_RUNNER_KEY, BUNNY_RING_KEY, IDLE_HOLDS, OTTER_KEY, SHIBA_RUNNER_KEY, gifFormClips, keyForClip } from './gifForms.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The bichon lifter's red headband and blue bow, dark edges included. */
const BICHON_BAND_OR_BOW = (r, g, b) => (r > 80 && r - g > 50 && r - b > 40) || (b > 60 && b - r > 35 && b - g > 20);
/**
 * The forms animated as video rather than drawn (the lifters, and now the
 * bear runner). `clips` are the file names
 * in that pet's source folder, without the extension; which animation each one
 * plays is decided in petSprites.ts, not here.
 */
const PETS = {
  bichon: {
    source: 'bichon-lifter',
    output: 'bichonLifter',
    clips: ['idle', 'idle-flex', 'jump', 'walk', 'dizzy', 'hurt'],
    // The videos' background is the dog's own white, so only the flood from
    // the border is safe in general. But where the art closes round a gap (the
    // slit between the legs, under a fist raised to flex, inside the curl of
    // the tail) the background shows through as white walled in by outline all
    // round, which the fur's white never is: it meets grey shading somewhere.
    // Not beside the red headband or the blue bow, which wall in the fur on
    // top of the head and down the chest.
    key: { clearCreases: [
      // The slits, up to 9px across.
      { area: 300, width: 9, reach: 40, paleLuma: 235, walled: 0.95, nearReach: 6, unlessNear: BICHON_BAND_OR_BOW },
      // Then the gaps, which are solid (a 9px square fits), unlike an eye's spiral.
      // Its outline is soft at the edges: up to ~110 counts, or a gap
      // between the tail and the head (walk, idle-flex) is not walled.
      { area: 3000, width: 70, reach: 40, thick: 9, paleLuma: 235, walled: 0.9, nearReach: 6, unlessNear: BICHON_BAND_OR_BOW, outlineLuma: 110 },
    ] },
  },
  bear: {
    source: 'bear-lifter',
    output: 'bearLifter',
    // Idle is the original video; everything else is the GIF set (31 frames at
    // 6fps, cut out). Each GIF opens on one stray frame of the old pose, so the
    // clips start at frame 1. The run loops whole strides (8 frames each), and
    // `lie` is the collapse's lying-still tail, looped, for rest.
    clips: [
      'idle-flex',
      { name: 'cheer', frames: [1, 30] },
      { name: 'run', frames: [1, 24] },
      { name: 'dizzy', frames: [2, 30] },
      { name: 'sad', frames: [1, 30] },
      { name: 'collapse', frames: [1, 30] },
      { name: 'lie', from: 'collapse', frames: [19, 30] },
    ],
    // The flexing arm closes a gap against the body. No `closeGaps`: its arms
    // hang a real gap from its sides, which should stay see-through.
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true },
    // Only the dizzy GIF has white filled in behind its art (inside the ring of
    // stars). Elsewhere a white patch is the bear's own, like its open mouth.
    cutOutPockets: ['dizzy'],
    // The cheer and collapse GIFs have see-through holes in the bear's teeth on
    // some frames, so the mouth flickers onto the room behind. Not the run: its
    // one hole is the real gap inside a curled arm.
    fillHoles: { clips: ['cheer', 'collapse'], maxArea: 200 },
  },
  bearRunner: {
    source: 'bear-runner',
    output: 'bearRunner',
    // The run starts from a standstill; only its stride (four frames a step,
    // three steps) is looped, so it never stops to stand up again.
    clips: ['idle', 'cheer', { name: 'run', frames: [15, 26] }, 'dizzy', 'tired', 'lie-down'],
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true, clearCreases: true },
  },
  bearScholar: {
    source: 'bear-scholar',
    output: 'bearScholar',
    clips: ['idle', 'walk', 'cheer', 'dizzy', 'cry', 'collapse'],
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true, clearCreases: true },
  },
  // The bunny's three forms: GIFs at 6fps, already cut out. Its fur is near
  // white, so like the bichon it takes the default key: no pockets and no
  // grey fringe, either of which would eat into the fur. The runner and
  // scholar only add BUNNY_RING_KEY, for the white inside their ring of stars.
  bunnyLifter: {
    source: 'bunny-lifter',
    output: 'bunnyLifter',
    // The idle is idle-flex's standing part without the flex (96-118): it
    // repeats one 31-frame cycle (31 and 62 match 0 exactly), so it loops
    // 0-30. The run loops one whole 18-frame hop (6 matches 24); `lie` is the
    // collapse's lying-still tail, looped, for rest.
    clips: [
      { name: 'idle', from: 'idle-flex', frames: [0, 30] },
      'cheer',
      { name: 'run', frames: [6, 23] },
      'dizzy',
      'sad',
      'collapse',
      { name: 'lie', from: 'collapse', frames: [17, 30] },
    ],
  },
  bunnyRunner: {
    source: 'bunny-runner',
    output: 'bunnyRunner',
    key: BUNNY_RING_KEY,
    // The idle drops 2-6, where it puffs its chest out (the medal pushes
    // forward); 1 joins 7 as smoothly as 6 did. A quick hop, three frames a
    // stride: eight strides loop cleanly.
    clips: [{ name: 'idle', frames: [0, 26], skip: [2, 6] }, 'cheer', { name: 'run', frames: [6, 29] }, 'dizzy', 'tired', 'lie-down'],
  },
  bunnyScholar: {
    source: 'bunny-scholar',
    output: 'bunnyScholar',
    key: BUNNY_RING_KEY,
    // Five frames a step: five steps loop cleanly.
    clips: ['idle', 'cheer', { name: 'walk', frames: [6, 30] }, 'dizzy', 'cry', 'collapse'],
  },
  // The axolotl's three forms: GIFs at 6fps, already cut out, keyed as their
  // sheets are. Runs loop on frames 1-30 (whole strides for all three); `lie`
  // is each collapse's lying-flat tail (22+), looped, for rest.
  axolotlLifter: {
    source: 'axolotl-lifter',
    output: 'axolotlLifter',
    key: AXOLOTL_KEY.axolotlLifter,
    clips: [{ name: 'idle-flex', hold: IDLE_HOLDS.axolotlLifter }, 'cheer', { name: 'run', frames: [1, 30] }, 'dizzy', 'sad', 'collapse', { name: 'lie', from: 'collapse', frames: [22, 30] }],
  },
  axolotlRunner: {
    source: 'axolotl-runner',
    output: 'axolotlRunner',
    key: AXOLOTL_KEY.axolotlRunner,
    clips: [{ name: 'idle', hold: IDLE_HOLDS.axolotlRunner }, 'cheer', { name: 'run', frames: [1, 30] }, { name: 'dizzy', frames: [3, 30] }, 'tired', 'lie-down', { name: 'lie', from: 'lie-down', frames: [22, 30] }],
  },
  axolotlScholar: {
    source: 'axolotl-scholar',
    output: 'axolotlScholar',
    key: AXOLOTL_KEY.axolotlScholar,
    clips: [{ name: 'idle', hold: IDLE_HOLDS.axolotlScholar }, 'cheer', { name: 'walk', frames: [1, 30] }, 'dizzy', 'cry', 'collapse', { name: 'lie', from: 'collapse', frames: [22, 30] }],
  },
  // The bichon and shiba runners: GIFs at 6fps, already cut out, keyed as
  // their sheets are in buildVideoSheet.mjs. Loops are cut to whole strides
  // and cycles; `lie` is the lie-down's lying-still tail, looped, for rest.
  bichonRunner: {
    source: 'bichon-runner',
    output: 'bichonRunner',
    // The GIFs make the fur above the headband see-through on some frames,
    // behind gaps in the dashed outline (see fillBehindGaps).
    capBehindGaps: { radius: 8, nextTo: (r, g, b) => r > 190 && g > 80 && g < 170 && b < 90 },
    // Same key as its sheet: peels the pale rim under its outline.
    key: BICHON_RUNNER_KEY,
    clips: [
      // Just the tail wag, which loops cleanly.
      { name: 'idle', frames: [16, 23] },
      'cheer',
      { name: 'run', frames: [0, 29] },
      { name: 'dizzy', frames: [2, 28] },
      'tired',
      'lie-down',
      { name: 'lie', from: 'lie-down', frames: [17, 30] },
    ],
  },
  shibaRunner: {
    source: 'shiba-runner',
    output: 'shibaRunner',
    clips: [
      'idle',
      'cheer',
      { name: 'run', frames: [0, 11] },
      { name: 'dizzy', frames: [2, 30] },
      'tired',
      'lie-down',
      { name: 'lie', from: 'lie-down', frames: [15, 30] },
    ],
    key: SHIBA_RUNNER_KEY,
  },
  // The base otter: GIFs at 6fps, already cut out. Same key as its sheet in
  // buildVideoSheet.mjs: peels the light-grey ring round the outline.
  otter: {
    source: 'otter',
    output: 'otter',
    key: OTTER_KEY,
    // The run's ten whole strides and the dizzy's five whole cycles skip the
    // still opening frame, so they loop without a hitch. `lie` is the
    // collapse's lying-still tail, looped, for rest.
    clips: [
      'idle',
      'cheer',
      { name: 'run', frames: [1, 30] },
      { name: 'dizzy', frames: [1, 30] },
      'cry',
      'collapse',
      { name: 'lie', from: 'collapse', frames: [17, 30] },
    ],
  },
};

// The generated set of evolved forms (see gifForms.mjs).
Object.assign(PETS, gifFormClips());

const pet = PETS[process.argv[2]];
if (!pet) {
  console.error(`usage: node scripts/buildLifterVideos.mjs <${Object.keys(PETS).join(' | ')}>`);
  process.exit(1);
}

const sources = path.join(root, 'assets/source/video', pet.source);
const output = path.join(root, 'assets/pet/video', pet.output);
const CLIPS = pet.clips;

/**
 * Every clip ships at this rate, whatever it was generated at (8fps or 24fps).
 * Resampled, not retimed: frames are dropped so a clip keeps its length and
 * speed, and moves in the steppier way hand-drawn sprites do.
 */
const FPS = 6;

fs.mkdirSync(output, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), `${pet.output}-video-`));

try {
  for (const entry of CLIPS) {
    // A clip is a source file's name, or { name, from, frames: [first, last] }
    // to cut one out of part of another source, optionally with `skip:
    // [first, last]` dropping a stretch from the middle of that range.
    // `hold: { at: [...], frames }` shows each listed source frame `frames`
    // times in all, a still pause (see IDLE_HOLDS in gifForms.mjs).
    const { name: clip, from = clip, frames: range, skip, hold } = typeof entry === 'string' ? { name: entry } : entry;
    // A pre-cut GIF of a clip wins over its video; keyBackground starts from
    // the GIF's own transparency.
    const gif = path.join(sources, `${from}.gif`);
    const source = fs.existsSync(gif) ? gif : path.join(sources, `${from}.mp4`);
    const frames = path.join(work, clip);
    fs.mkdirSync(frames);
    const key = { ...keyForClip(pet.key, from), cutOutPockets: pet.cutOutPockets?.includes(from) ?? false };
    const dropped = skip ? `*not(between(n\\,${skip[0]}\\,${skip[1]}))` : '';
    const filter = range ? `fps=${FPS},select='between(n\\,${range[0]}\\,${range[1]})${dropped}'` : `fps=${FPS}`;
    execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-vf', filter, '-fps_mode', 'vfr', '-pix_fmt', 'rgba', path.join(frames, '%04d.png')]);
    for (const file of fs.readdirSync(frames)) {
      const raw = PNG.sync.read(fs.readFileSync(path.join(frames, file)));
      if (pet.fillHoles?.clips.includes(from)) fillHoles(raw, pet.fillHoles.maxArea);
      if (pet.capBehindGaps) fillBehindGaps(raw, pet.capBehindGaps);
      // By output name: the bichon lifter is built as `bichon`.
      const png = applyFrameErase(pet.output, from, sourceFrame(file, range, skip), keyBackground(raw, key));
      fs.writeFileSync(path.join(frames, file), PNG.sync.write(png));
    }
    // Holds repeat a finished (keyed and erased) frame, so a repeat is that
    // source frame exactly; the sequence is renumbered into a fresh folder.
    let sequence = frames;
    if (hold) {
      sequence = path.join(work, `${clip}-held`);
      fs.mkdirSync(sequence);
      let n = 0;
      for (const file of fs.readdirSync(frames).sort()) {
        const repeat = hold.at.includes(sourceFrame(file, range, skip)) ? hold.frames : 1;
        for (let k = 0; k < repeat; k += 1) {
          n += 1;
          fs.copyFileSync(path.join(frames, file), path.join(sequence, `${String(n).padStart(4, '0')}.png`));
        }
      }
    }
    // ProRes 4444 first (it carries alpha and ffmpeg can write it anywhere),
    // then Apple's own encoder for the HEVC-with-alpha the app ships. ffmpeg's
    // hevc_videotoolbox cannot do alpha when it runs under Rosetta.
    const prores = path.join(work, `${clip}.mov`);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error',
      '-framerate', String(FPS), '-i', path.join(sequence, '%04d.png'),
      '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
      prores,
    ]);
    const target = path.join(output, `${clip}.mov`);
    execFileSync('avconvert', ['--source', prores, '--preset', 'PresetHEVCHighestQualityWithAlpha', '--output', target, '--replace'], { stdio: 'ignore' });
    const webm = path.join(output, `${clip}.webm`);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error',
      '-framerate', String(FPS), '-i', path.join(sequence, '%04d.png'),
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '18', '-b:v', '0', '-auto-alt-ref', '0',
      webm,
    ]);
    console.log(`wrote ${path.relative(root, target)} and .webm (${fs.readdirSync(sequence).length} frames)`);
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
