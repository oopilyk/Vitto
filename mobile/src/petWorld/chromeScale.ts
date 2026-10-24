import { useWindowDimensions } from 'react-native';

/**
 * How much bigger to draw the pet world's chrome (the HUD, the hotbar, a room's
 * call to action) on this screen.
 *
 * Every one of those is sized in fixed points for a phone. On an iPad the room
 * and the pet scale with the screen (see `stageMetrics`) but the chrome did
 * not, so it sat tiny and lost in the corners of a big stage. A tablet zooms
 * it by the smaller of its width and height over the reference phone's
 * (393x852): bounded by the height, the HUD's three stacked rows take the same
 * share of the screen as they do on the phone and never grow down over the pet.
 *
 * Phones are always 1 — every phone layout, the reference included, stays
 * exactly as it was.
 */
export const TABLET_MIN_WIDTH = 600;
export const MAX_CHROME_SCALE = 1.5;

export const chromeScaleFor = (width: number, height: number): number => {
  if (!(width >= TABLET_MIN_WIDTH) || !(height > 0)) return 1;
  const scale = Math.min(width / 393, height / 852);
  return Math.round(Math.min(MAX_CHROME_SCALE, Math.max(1, scale)) * 100) / 100;
};

/**
 * Space to leave above the HUD for the status bar, in the HUD's own points.
 *
 * 56 clears the notch / Dynamic Island on every modern iPhone. A screen that is
 * not tall and narrow has no notch — the home-button iPhones (SE, 8: 16:9) and
 * every iPad — and only a 20-24pt status bar, so there the same 56 left a
 * dead band above the HUD and pushed the whole HUD down towards the pet on the
 * shortest screen of all.
 */
export const NOTCH_TOP_INSET = 56;
export const STATUS_BAR_TOP_INSET = 32;

export const topInsetFor = (width: number, height: number): number =>
  width > 0 && height / width < 1.9 ? STATUS_BAR_TOP_INSET : NOTCH_TOP_INSET;

export function useChromeScale(): number {
  const { width, height } = useWindowDimensions();
  return chromeScaleFor(width, height);
}
