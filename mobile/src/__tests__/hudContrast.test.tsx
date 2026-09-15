/**
 * The HUD's readout sits on an opaque plaque, so its legibility depends only on
 * the plaque's own colour — which is exactly what these pin. Every tone is
 * measured against the day and the night panel it is actually drawn on.
 */
const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = ([r, g, b]: number[]) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** A translucent chip composited onto the panel beneath it. */
const chipOn = (chip: string, alpha: number, panel: string) =>
  rgb(chip).map((c, i) => Math.round(c * alpha + rgb(panel)[i]! * (1 - alpha)));

const DAY_PANEL = '#efe5d0'; // world.surface
const NIGHT_PANEL = '#2b2420'; // world.nightSurface

describe('HUD readout contrast', () => {
  it('draws the readout as an opaque retro plaque, never straight onto the art', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../petWorld/PetWorldHud.tsx'),
      'utf8',
    );
    // The panel token supplies an opaque fill; a translucent scrim would put
    // the contrast back at the mercy of whatever the picture behind it is.
    expect(source).toContain('retro.panel, night && retro.panelNight, styles.readout');
    expect(source).not.toMatch(/readout:[^}]*backgroundColor:\s*'rgba/);
  });

  it.each([
    ["the pet's own line", '#43372c', '#efe5d0', 4.5],
    ['the day and streak line', '#6f6252', '#b3a690', 4.5],
    ['the partner line', '#7d6d5e', '#a99a83', 3],
    ['the streak flame', '#a9553c', '#d17f60', 3],
  ])('keeps %s readable on both panels', (_label, day, night, floor) => {
    const onDay = contrast(rgb(day), rgb(DAY_PANEL));
    const onNight = contrast(rgb(night), rgb(NIGHT_PANEL));
    expect({ onDay: +onDay.toFixed(1), onNight: +onNight.toFixed(1), readable: onDay >= floor && onNight >= floor })
      .toMatchObject({ readable: true });
  });

  it('keeps a food effect tag readable on its chip, on both panels', () => {
    const day = contrast(rgb('#7a5f16'), chipOn('#d6b760', 0.35, DAY_PANEL));
    const night = contrast(rgb('#e4c878'), chipOn('#e4c878', 0.16, NIGHT_PANEL));
    expect({ day: +day.toFixed(1), night: +night.toFixed(1), readable: day >= 3 && night >= 3 })
      .toMatchObject({ readable: true });
  });
});
