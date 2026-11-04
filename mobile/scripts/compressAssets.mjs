#!/usr/bin/env node
/**
 * Shrinks the art and music the app ships, without changing how any of it
 * looks or sounds on a phone.
 *
 *   node scripts/compressAssets.mjs            (everything not yet compressed)
 *   node scripts/compressAssets.mjs --dry-run  (what it would do)
 *
 *   assets/pet/video/<pet>/*.mov HEVC with alpha at quality 0.5 (scripts/hevcAlpha.swift).
 *                                buildLifterVideos.mjs wrote them at the highest
 *                                quality, ~2.5 MB a clip; at 0.5 they are ~0.6 MB
 *                                and look the same at the size the pet is drawn.
 *   assets/pet/*.png             256-colour palettes that keep soft edges (pngquant).
 *                                The sheets are drawn art, not true pixel art, so
 *                                this is lossy -- but only by an amount pngquant
 *                                is told to refuse to go past.
 *   assets/music/lofi-N.m4a      Re-encoded from the WAV masters beside them, at
 *                                96 kbps AAC (was 128): background music at a
 *                                third of full volume.
 *
 * Re-running is safe. Every file it writes is recorded in
 * scripts/data/compressedAssets.json by its hash, and a file whose hash is
 * already there is skipped -- compressing an already-compressed clip again
 * would only lose quality. A new or regenerated file has a new hash, so it is
 * picked up. Needs macOS (the alpha encoder and afconvert are Apple's) and
 * pngquant (`brew install pngquant`).
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const ledgerPath = path.join(root, 'scripts/data/compressedAssets.json');
const dryRun = process.argv.includes('--dry-run');

/** HEVC-with-alpha quality, 0-1. 0.35 went visibly soft; 0.5 did not. */
const VIDEO_QUALITY = '0.5';
/** pngquant's floor and target: below the floor it keeps the original. */
const PNG_QUALITY = '80-95';
const MUSIC_BITRATE = '96000';

const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
const hashOf = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
const rel = (file) => path.relative(root, file);
const done = (file) => ledger[rel(file)] === hashOf(file);

const walk = (dir, match) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, match);
    return match(entry.name) ? [full] : [];
  });

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vitto-compress-'));
const encoder = path.join(work, 'hevcAlpha');
let saved = 0;

/** Writes `next` over `file` only if it is smaller, and records the result. */
const replaceIfSmaller = (file, next) => {
  const before = fs.statSync(file).size;
  const after = fs.existsSync(next) ? fs.statSync(next).size : Infinity;
  if (after < before) {
    fs.copyFileSync(next, file);
    saved += before - after;
    console.log(`${rel(file)}: ${(before / 1e6).toFixed(2)} -> ${(after / 1e6).toFixed(2)} MB`);
  } else {
    console.log(`${rel(file)}: kept (no smaller)`);
  }
  ledger[rel(file)] = hashOf(file);
};

try {
  const videos = walk(path.join(assets, 'pet/video'), (name) => name.endsWith('.mov')).filter((file) => !done(file));
  const sprites = fs
    .readdirSync(path.join(assets, 'pet'))
    .filter((name) => name.endsWith('.png'))
    .map((name) => path.join(assets, 'pet', name))
    .filter((file) => !done(file));
  const tracks = fs
    .readdirSync(path.join(assets, 'music'))
    .filter((name) => /^lofi-\d+\.m4a$/.test(name))
    .map((name) => path.join(assets, 'music', name))
    .filter((file) => !done(file));

  console.log(`${videos.length} clips, ${sprites.length} sprite sheets, ${tracks.length} tracks to compress`);
  if (!dryRun && videos.length) {
    execFileSync('swiftc', ['-O', path.join(root, 'scripts/hevcAlpha.swift'), '-o', encoder], { stdio: 'inherit' });
    for (const file of videos) {
      const next = path.join(work, 'clip.mov');
      execFileSync(encoder, [file, next, VIDEO_QUALITY]);
      replaceIfSmaller(file, next);
    }
  }

  for (const file of dryRun ? [] : sprites) {
    const next = path.join(work, 'sheet.png');
    try {
      execFileSync('pngquant', ['--quality', PNG_QUALITY, '--speed', '1', '--strip', '--force', '--output', next, file]);
    } catch {
      // Exit 99: it could not stay above the quality floor. The original stays.
      if (fs.existsSync(next)) fs.rmSync(next);
    }
    replaceIfSmaller(file, next);
  }

  for (const file of dryRun ? [] : tracks) {
    // lofi-3.m4a was made from "lofi_nf_ (3).wav".
    const n = path.basename(file).match(/\d+/)[0];
    const master = path.join(assets, 'music', `lofi_nf_ (${n}).wav`);
    if (!fs.existsSync(master)) {
      console.log(`${rel(file)}: no WAV master, kept`);
      continue;
    }
    const next = path.join(work, 'track.m4a');
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', MUSIC_BITRATE, '-q', '127', master, next]);
    replaceIfSmaller(file, next);
  }
} finally {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  if (!dryRun) console.log(`saved ${(saved / 1e6).toFixed(1)} MB`);
}
