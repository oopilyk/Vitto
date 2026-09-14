import type { FourCorner } from '@vitto/core';

/**
 * Geometry and timing for the Four Corners play area, kept out of the screen so
 * the layout numbers, the animation durations and the accessibility labels all
 * have one home — and so the test can build the same label the tile renders.
 */

/** Spoken name of each corner — the first half of every tile's accessibility label. */
export const CORNER_NAME: Record<FourCorner, string> = {
  topLeft: 'Top left',
  topRight: 'Top right',
  bottomLeft: 'Bottom left',
  bottomRight: 'Bottom right',
};

/**
 * The base accessibility label a corner tile carries. During a reveal the tile
 * appends its mark ("CORRECT" / "ANSWER" / "YOUR PICK") to this — see
 * `CornerTile` — so the verdict reaches a screen reader and not only the eye.
 */
export const cornerLabel = (corner: FourCorner, answer: string): string =>
  `${CORNER_NAME[corner]}: ${answer}`;

export const isLeftCorner = (corner: FourCorner): boolean =>
  corner === 'topLeft' || corner === 'bottomLeft';

export const isTopCorner = (corner: FourCorner): boolean =>
  corner === 'topLeft' || corner === 'topRight';

/**
 * The whole loop's tempo. A round is five questions and has to fit in under a
 * minute, so every one of these is deliberately short: the jump is over before
 * it can read as waiting, and the hold is just long enough to take in which
 * tile went green before the next question slides in.
 */
export const JUMP_MS = 210;
/** Reduce Motion keeps the reveal and the auto-advance — only the travel goes. */
export const REDUCED_JUMP_MS = 0;
export const REVEAL_HOLD_MS = 780;

export interface PlaySize {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

/** Used until the play area has reported its real size. */
export const FALLBACK_PLAY_SIZE: PlaySize = { width: 340, height: 340 };

/**
 * How far off centre a corner sits, as a share of the *measured* play area
 * rather than a fixed point offset — the same reason `stageMetrics` scales the
 * pet: a number tuned on a 393pt phone lands the pet outside the board on a
 * 360pt one and short of it on a tablet.
 */
const CORNER_X_FRACTION = 0.3;
/**
 * Shorter than the horizontal reach on purpose. The pet is drawn over the tiles,
 * and a full-height hop put its sprite across the bottom of the tile it had just
 * landed under — exactly where that tile prints its "CORRECT" / "ANSWER" mark.
 * Landing nearer the middle keeps the hop clearly directional while leaving the
 * mark visible.
 */
const CORNER_Y_FRACTION = 0.22;

export const cornerOffset = (corner: FourCorner, size: PlaySize): Offset => ({
  x: (isLeftCorner(corner) ? -1 : 1) * size.width * CORNER_X_FRACTION,
  y: (isTopCorner(corner) ? -1 : 1) * size.height * CORNER_Y_FRACTION,
});

/** The pet, sized off the shorter side so it never crowds the tiles on a small phone. */
export const PET_MIN_SIZE = 78;
export const PET_MAX_SIZE = 136;
const PET_SIZE_FRACTION = 0.3;
export const petSizeFor = (size: PlaySize): number =>
  Math.round(
    Math.max(PET_MIN_SIZE, Math.min(PET_MAX_SIZE, Math.min(size.width, size.height) * PET_SIZE_FRACTION)),
  );
