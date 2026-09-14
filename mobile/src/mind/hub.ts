import type { BrainTrainingMetadata } from '@vitto/core';
import type { MindGameEntry, MindRouteKey } from './types';

/**
 * The Mind hub's decisions, as pure functions over the registry. Kept out of
 * the screen so each one can be stated and tested on its own — none of them
 * needs a render to be right or wrong.
 */

export type MindRouteHandlers = Partial<Record<MindRouteKey, (() => void) | undefined>>;

/** Whether today's mind events include a play of this game. */
export const isMindGamePlayed = (
  game: MindGameEntry,
  playedToday: ReadonlySet<BrainTrainingMetadata['game']>,
): boolean => game.playedAs.some((id) => playedToday.has(id));

/**
 * The games the hub can actually start right now, in registry order.
 *
 * A stage game always can be — the hub owns the sheet it plays in. A route game
 * only once its route is wired up: `MindGymScreen`'s route callbacks are
 * optional so the hub still stands alone in a test or a partial build, and a
 * card that navigates nowhere is worse than no card.
 */
export const availableMindGames = (
  games: readonly MindGameEntry[],
  routes: MindRouteHandlers,
): readonly MindGameEntry[] =>
  games.filter((game) => game.launch.kind === 'stage' || Boolean(routes[game.launch.route]));

/**
 * A number from a date key, so the feature is the same game all day and a
 * different one tomorrow. Not a hash with any properties beyond that — it only
 * has to be stable and to move.
 */
const dayOffset = (dayKey: string): number => {
  let total = 0;
  for (let index = 0; index < dayKey.length; index += 1) {
    total = (total * 31 + dayKey.charCodeAt(index)) % 100000;
  }
  return total;
};

/**
 * The one game given the large card at the top of the hub.
 *
 * Rotates by calendar day so the hub is not the same page every morning, and
 * prefers a game not yet played today so the feature is an invitation rather
 * than a trophy. Once the whole roster is played it settles back on the day's
 * own pick instead of vanishing — the hierarchy is part of the layout, and a
 * hub that reflows when you finish your last game reads as broken.
 */
export const featuredMindGame = (
  games: readonly MindGameEntry[],
  dayKey: string,
  playedToday: ReadonlySet<BrainTrainingMetadata['game']>,
): MindGameEntry | null => {
  if (games.length === 0) return null;
  const start = dayOffset(dayKey) % games.length;
  for (let step = 0; step < games.length; step += 1) {
    const candidate = games[(start + step) % games.length];
    if (!isMindGamePlayed(candidate, playedToday)) return candidate;
  }
  return games[start];
};
