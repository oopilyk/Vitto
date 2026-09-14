import {
  type BrainTrainingMetadata,
  MATH_ROUND_SECONDS,
  brainTrainingXp,
  jeopardyMaxBoardPoints,
} from '@vitto/core';
import type { MindGameEntry } from './types';

/**
 * Every Mind game there is, in the order the hub shows them.
 *
 * Adding a game is adding an entry here plus (for a route game) a callback on
 * `MindGymScreen`; the hub's layout has no per-game code to touch.
 */

/**
 * The ceiling the pet engine would actually pay for a flawless session, asked
 * of the engine rather than written down.
 *
 * Copying the numbers into this file would put a second, silently-drifting
 * statement of the reward economy next to the real one — the cards would keep
 * quoting 20 XP for a week after someone changed the formula. So the registry
 * calls `brainTrainingXp` with a perfect result instead.
 */
const maxXpFor = (game: BrainTrainingMetadata['game']): number =>
  brainTrainingXp({ game, correct: 1, total: 1 });

/**
 * Pet Jeopardy does not use the accuracy formula at all: it states its own xp
 * (see `toJeopardyMetadata`). Its best case is a full board carried through a
 * won final — a doubling — which `brainTrainingXp` still clamps to the override
 * ceiling, so this asks the same function the same way the game will.
 */
const JEOPARDY_MAX_XP = brainTrainingXp({
  game: 'petJeopardy',
  correct: 1,
  total: 1,
  xpAwarded: jeopardyMaxBoardPoints() * 2,
});

const MATH_ROUND_MINUTES = Math.max(1, Math.round(MATH_ROUND_SECONDS / 60));

export const MIND_GAMES: readonly MindGameEntry[] = [
  {
    id: 'fourCorners',
    name: 'Four Corners',
    blurb: 'Five quick questions — your pet runs to the answer you pick.',
    category: 'REACTION',
    minutes: 2,
    maxXp: maxXpFor('fourCorners'),
    hasPoints: true,
    launch: { kind: 'route', route: 'fourCorners' },
    playedAs: ['fourCorners'],
  },
  {
    id: 'petJeopardy',
    name: 'Pet Jeopardy',
    blurb: 'Pick three squares, then wager what you won on one final question.',
    category: 'TRIVIA',
    minutes: 4,
    maxXp: JEOPARDY_MAX_XP,
    hasPoints: true,
    launch: { kind: 'route', route: 'petJeopardy' },
    playedAs: ['petJeopardy'],
  },
  {
    id: 'wordPuzzle',
    name: "Today's word puzzle",
    blurb: 'One five-letter word a day, six guesses, one shot.',
    category: 'WORDS',
    minutes: 4,
    maxXp: maxXpFor('wordPuzzle'),
    hasPoints: false,
    launch: { kind: 'route', route: 'wordPuzzle' },
    playedAs: ['wordPuzzle'],
  },
  {
    id: 'wordGarden',
    name: 'Word garden',
    blurb: 'Grow words from one seed letter — runs multiply, and it is untimed.',
    category: 'WORDS',
    minutes: 5,
    maxXp: maxXpFor('wordGarden'),
    hasPoints: true,
    launch: { kind: 'stage', stage: 'garden' },
    // `spellingBee` is this game's former id; old events still carry it.
    playedAs: ['wordGarden', 'spellingBee'],
  },
  {
    id: 'countryGuess',
    name: 'Guess the country',
    blurb: 'Three mystery countries, narrowed by distance and direction.',
    category: 'GEOGRAPHY',
    minutes: 4,
    maxXp: maxXpFor('countryGuess'),
    hasPoints: false,
    launch: { kind: 'stage', stage: 'country' },
    playedAs: ['countryGuess'],
  },
  {
    id: 'math',
    name: 'Quick maths',
    blurb: `${MATH_ROUND_SECONDS} seconds of sums that get harder the longer you hold a streak.`,
    category: 'LOGIC',
    minutes: MATH_ROUND_MINUTES,
    maxXp: maxXpFor('math'),
    hasPoints: false,
    launch: { kind: 'stage', stage: 'math' },
    playedAs: ['math'],
  },
  {
    id: 'reading',
    name: 'Read and recall',
    blurb: 'A short passage, then questions on it from memory alone.',
    category: 'MEMORY',
    minutes: 3,
    maxXp: maxXpFor('reading'),
    hasPoints: false,
    launch: { kind: 'stage', stage: 'reading' },
    playedAs: ['reading'],
  },
];
