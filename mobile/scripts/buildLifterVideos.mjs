/**
 * Makes the transparent playback copies of a lifter's animation clips.
 *
 *   node scripts/buildLifterVideos.mjs bichon
 *   node scripts/buildLifterVideos.mjs bear
 *   node scripts/buildLifterVideos.mjs bearRunner
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
import { keyBackground } from './keyBackground.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  },
  bear: {
    source: 'bear-lifter',
    output: 'bearLifter',
    clips: ['idle-flex', 'walk', 'states', 'pot'],
    // The flexing arm closes a gap against the body. No `closeGaps`: its arms
    // hang a real gap from its sides, which should stay see-through.
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true },
  },
  bearRunner: {
    source: 'bear-runner',
    output: 'bearRunner',
    clips: ['idle', 'cheer', 'run', 'dizzy', 'tired', 'lie-down'],
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true, clearCreases: true },
  },
  bearScholar: {
    source: 'bear-scholar',
    output: 'bearScholar',
    clips: ['idle', 'walk', 'cheer', 'dizzy', 'cry', 'collapse'],
    key: { pocketArea: 200, pocketReach: 10, greyFringe: true, clearCreases: true },
  },
};

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
    // to cut one out of part of another source.
    const { name: clip, from = clip, frames: range } = typeof entry === 'string' ? { name: entry } : entry;
    // A pre-cut GIF of a clip wins over its video; keyBackground starts from
    // the GIF's own transparency.
    const gif = path.join(sources, `${from}.gif`);
    const source = fs.existsSync(gif) ? gif : path.join(sources, `${from}.mp4`);
    const frames = path.join(work, clip);
    fs.mkdirSync(frames);
    const filter = range ? `fps=${FPS},select='between(n\\,${range[0]}\\,${range[1]})'` : `fps=${FPS}`;
    execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-vf', filter, '-fps_mode', 'vfr', '-pix_fmt', 'rgba', path.join(frames, '%04d.png')]);
    for (const file of fs.readdirSync(frames)) {
      const png = keyBackground(PNG.sync.read(fs.readFileSync(path.join(frames, file))), pet.key);
      fs.writeFileSync(path.join(frames, file), PNG.sync.write(png));
    }
    // ProRes 4444 first (it carries alpha and ffmpeg can write it anywhere),
    // then Apple's own encoder for the HEVC-with-alpha the app ships. ffmpeg's
    // hevc_videotoolbox cannot do alpha when it runs under Rosetta.
    const prores = path.join(work, `${clip}.mov`);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error',
      '-framerate', String(FPS), '-i', path.join(frames, '%04d.png'),
      '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
      prores,
    ]);
    const target = path.join(output, `${clip}.mov`);
    execFileSync('avconvert', ['--source', prores, '--preset', 'PresetHEVCHighestQualityWithAlpha', '--output', target, '--replace'], { stdio: 'ignore' });
    const webm = path.join(output, `${clip}.webm`);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error',
      '-framerate', String(FPS), '-i', path.join(frames, '%04d.png'),
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '18', '-b:v', '0', '-auto-alt-ref', '0',
      webm,
    ]);
    console.log(`wrote ${path.relative(root, target)} and .webm (${fs.readdirSync(frames).length} frames)`);
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
