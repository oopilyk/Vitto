import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Two palettes must never meet on one surface.
 *
 * The pet world's panels (`retro`, `world`) are fixed colours: cream by day,
 * charcoal by night, switched only by a `night` flag. The app's `colors` follow
 * dark mode. Put a `colors` text tone on a `retro` panel and dark mode paints
 * cream type on a cream panel by day, which is exactly what happened on Today.
 *
 * So a file that draws pet-world panels takes its text colours from `world`
 * (or from a palette it picks with the same flag), never from `colors`.
 */
const SRC = join(__dirname, '..');
const TEXT_TONES = /colors\.(ink|inkSoft|muted|faint)\b/;
const DRAWS_RETRO_PANEL = /retro\.panel/;

/** Files whose `colors` text sits on a surface that follows dark mode too, not on a retro panel. */
const ALLOWED: Record<string, string> = {
  // The pager and back row sit on the friends palette, which follows dark mode.
  'screens/FriendPetScreen.tsx': 'pager on the friends palette',
};

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });

describe('palette mixing', () => {
  it('keeps dark-mode text colours off pet-world panels', () => {
    const offenders = sources(SRC)
      .map((path) => ({ file: relative(SRC, path), text: readFileSync(path, 'utf8') }))
      .filter(({ file, text }) => !ALLOWED[file] && DRAWS_RETRO_PANEL.test(text))
      .flatMap(({ file, text }) =>
        text
          .split('\n')
          .map((line, index) => ({ line, at: `${file}:${index + 1}` }))
          .filter(({ line }) => TEXT_TONES.test(line))
          .map(({ at, line }) => `${at}  ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it('picks a text palette with the same flag as the panels it sits on', () => {
    // `night || dark ? nightColors : dayColors` beside `night && retro.panelNight`
    // is the Today bug: dark mode by day took the night type and kept the day
    // panel. Fold dark mode into `night` itself, so one flag decides both.
    const offenders = sources(SRC)
      .filter((path) => DRAWS_RETRO_PANEL.test(readFileSync(path, 'utf8')))
      .filter((path) => /night\s*\|\|\s*getColorScheme\(\)\s*===\s*'dark'\s*\?/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });
});
