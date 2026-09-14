import type { BrainTrainingMetadata } from '@vitto/core';

/**
 * The Mind hub's data model: one entry per playable game, and the small fixed
 * vocabulary the cards are written in.
 *
 * The point of the shape is that adding a game is adding a row. Nothing in the
 * hub's layout knows any game by name — it renders whatever {@link MIND_GAMES}
 * holds, in order.
 */

/**
 * The mental skill a game asks for, shown as the card's label.
 *
 * Deliberately a short closed set rather than free text: six words the whole
 * roster has to fit into is what makes the labels comparable at a glance. Two
 * games sharing one is fine and expected — this is a label, not a filter, and
 * there is no browse-by-category UI to keep balanced.
 */
export type MindCategory =
  | 'TRIVIA'
  | 'MEMORY'
  | 'WORDS'
  | 'LOGIC'
  | 'GEOGRAPHY'
  | 'REACTION';

/**
 * A game that already has its own route, named by what the hub calls to open
 * it rather than by the route string — `MindGymScreen` takes these as optional
 * callbacks, so the hub must be able to tell "this game is not wired up here"
 * from "this game does not exist".
 */
export type MindRouteKey = 'wordPuzzle' | 'fourCorners' | 'petJeopardy';

/**
 * A game played inside the hub's own sheet as a stage, rather than on a route
 * of its own. The four originals work this way and there is no reason to move
 * them: they are short, they have no navigation of their own, and the sheet is
 * already presented.
 */
export type MindStage = 'math' | 'reading' | 'garden' | 'country';

/** How the hub starts this game. The one thing a card's press has to resolve. */
export type MindLaunch =
  | { readonly kind: 'route'; readonly route: MindRouteKey }
  | { readonly kind: 'stage'; readonly stage: MindStage };

export interface MindGameEntry {
  /** Stable id, also the analytics/registry key. Not necessarily an event id. */
  readonly id: string;
  readonly name: string;
  /** One line. If it needs two, the game needs a shorter pitch, not a bigger card. */
  readonly blurb: string;
  readonly category: MindCategory;
  /** Roughly how long a session runs, in minutes, for the card's time line. */
  readonly minutes: number;
  /**
   * The most xp a perfect session of this game can be granted, read from the
   * pet engine's own award function rather than written down here — see
   * `maxXpFor` in `registry.ts`. A card must never quote a reward the engine
   * would not actually pay.
   */
  readonly maxXp: number;
  /** Whether this game reports a Mind Points score of its own. */
  readonly hasPoints: boolean;
  readonly launch: MindLaunch;
  /**
   * The `BrainTrainingMetadata['game']` ids that count as a play of this game.
   * More than one where a game has been renamed and old events still carry the
   * old id (the word garden's `spellingBee`).
   */
  readonly playedAs: readonly BrainTrainingMetadata['game'][];
}
