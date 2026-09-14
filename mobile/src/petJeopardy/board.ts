import { type JeopardyCell, type JeopardyGame, type JeopardyValue } from '@vitto/core';
import type { Offset, PlaySize } from '../fourCorners/corners';
import { world } from '../theme';

/**
 * Geometry, tempo and spoken labels for Pet Jeopardy, kept out of the screen so
 * the layout numbers, the animation clock and the accessibility strings all have
 * one home — the same split `fourCorners/corners.ts` makes.
 *
 * `JUMP_MS` / `REDUCED_JUMP_MS` are deliberately NOT redefined here: `usePetJump`
 * reads Four Corners' `JUMP_MS` internally, so a second copy of that number would
 * be a reveal clock that silently drifts out of step with the hop it is timing.
 */

/**
 * How long a board reveal stays up before the game walks itself back to the
 * squares. Four Corners' 780ms, plus a touch: there is one more thing to take in
 * here (the points flourish as well as the right answer), and the player is
 * returning to a board rather than being handed the next question.
 */
export const REVEAL_HOLD_MS = 820;

/**
 * The beat between locking in the final answer and learning the verdict.
 *
 * The only intentional wait in the game, and it is the point of the Final: the
 * pet holds still, the tiles stay neutral, and the result lands as an event.
 * Short enough that it reads as a drum roll rather than a spinner — anything
 * past about a second starts to feel like the app is thinking.
 */
export const FINAL_SUSPENSE_MS = 620;

/**
 * Wager stepper granularity. The ceiling is now whatever the round actually
 * earned (see `maxJeopardyWager`), not a fixed number, so 5 is chosen for a
 * typical round rather than to fit a specific max in a round number of taps.
 */
export const WAGER_STEP = 5;
/** Where the stepper starts: a real stake, but nowhere near a typical ceiling. */
export const DEFAULT_WAGER = 10;

/**
 * A cream that stays legible on the deep accent fill — the same value
 * `CornerTile` prints on its filled tiles (4.8:1 on `accentDeep`). Restated
 * rather than imported because it is private to that component.
 */
export const ON_FILL_TEXT = '#fdf6e7';

/**
 * Night's middle tier. The palette has one night surface and one night-soft
 * surface, and both are translucent-dark; the 200 row needs to sit visibly
 * *between* them and the accent fill, so it gets this one warm step up from
 * `nightSurface` rather than a reused token that would flatten the ladder.
 */
const NIGHT_MID_FILL = '#3c3029';

export interface ValueTone {
  fill: string;
  text: string;
}

/**
 * Higher value, deeper tile. Difficulty rises with the row (see the authoring
 * rules in `data/jeopardyQuestions.ts`), so the board says so before the player
 * has read a single question: cream at 100, a washed accent at 200, the full
 * accent at 300. Colour is the reinforcement, never the information — every tile
 * also prints its own value.
 */
export const valueTone = (value: JeopardyValue, night: boolean): ValueTone => {
  if (value >= 300) return { fill: world.accentDeep, text: ON_FILL_TEXT };
  if (value >= 200) {
    return night
      ? { fill: NIGHT_MID_FILL, text: world.nightText }
      : { fill: world.accentWash, text: world.ink };
  }
  return night
    ? { fill: world.nightSurface, text: world.nightText }
    : { fill: world.surface, text: world.ink };
};

/**
 * What a square says out loud. A played square has to announce that it is spent
 * *and* how it went — `accessibilityState.disabled` alone tells a screen-reader
 * user they cannot tap it, not that they already won it.
 */
export const cellLabel = (categoryLabel: string, cell: JeopardyCell): string => {
  if (!cell.played) return `${categoryLabel}, ${cell.value} XP`;
  const outcome = cell.correct ? `won ${cell.value} XP` : 'missed';
  return `${categoryLabel}, ${cell.value} XP, already played, ${outcome}`;
};

/**
 * An answer's spoken label. The reveal mark rides on it for the same reason
 * `CornerTile` does that: a mark printed as a child `Text` is never reached once
 * the Pressable carries a label of its own, so without this a VoiceOver user
 * plays a whole game and is never told whether they were right.
 */
export const answerLabel = (answer: string, mark: string | null): string =>
  mark ? `${answer}, ${mark}` : answer;

/** Warm, never scolding — a missed square costs XP, not encouragement. */
export const verdictLine = (correct: boolean, value: number, answer: string): string =>
  correct ? `CORRECT  ·  +${value} XP` : `NOT THIS TIME  ·  IT WAS ${answer.toUpperCase()}`;

export const finalVerdictLine = (correct: boolean, wager: number, answer: string): string =>
  correct
    ? `CORRECT  ·  +${wager} XP`
    : `IT WAS ${answer.toUpperCase()}  ·  -${wager} XP`;

/**
 * The pet's reaction hop, as a share of the *measured* pet stage rather than a
 * fixed point offset — a lift tuned on a 393pt phone clears the prompt panel on
 * one screen and lands behind it on another.
 *
 * Correct is a straight leap upward. Wrong is a small sideways shuffle, which is
 * the whole punishment: the pet is briefly sheepish, nothing flashes red at the
 * player, and the points simply are not added.
 */
const CORRECT_LIFT_FRACTION = 0.3;
const WRONG_SHUFFLE_FRACTION = 0.14;

/**
 * How much larger the pet is drawn for the Final than for a board square. The
 * base size is already a share of the measured lane (`petSizeFor`), so this
 * scales that answer rather than replacing it with a point size that would be
 * right on one phone only — and the Final's lane is taller to receive it.
 */
export const FINAL_PET_SCALE = 1.25;

export const petHopOffset = (correct: boolean, stage: PlaySize): Offset =>
  correct
    ? { x: 0, y: -stage.height * CORRECT_LIFT_FRACTION }
    : { x: -stage.width * WRONG_SHUFFLE_FRACTION, y: 0 };

/**
 * Whether the session earned a celebration. The Final decides it when it was
 * played — it is the moment the whole game builds to — and otherwise a game left
 * early is judged on the squares that were actually answered.
 */
export const isJeopardyWin = (game: JeopardyGame): boolean => {
  if (game.final && game.final.correct !== null) return game.final.correct;
  const played = game.cells.filter((cell) => cell.played);
  if (played.length === 0) return false;
  return played.filter((cell) => cell.correct).length * 2 >= played.length;
};
