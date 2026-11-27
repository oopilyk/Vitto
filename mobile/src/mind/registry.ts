import {
  type BrainTrainingMetadata,
  MATH_RUN_LIVES,
  MATH_RUN_SECONDS,
  brainTrainingXp,
  jeopardyMaxBoardPoints,
  wordGardenAvailable,
} from '@vitto/core';
import { t, wordPuzzleAvailable } from '../i18n';
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

const MATH_RUN_MINUTES = Math.max(1, Math.round(MATH_RUN_SECONDS / 60));

export const MIND_GAMES: readonly MindGameEntry[] = [
  {
    id: 'fourCorners',
    name: t('Four Corners'),
    blurb: t('Five quick questions. Your pet runs to your answer.'),
    category: 'REACTION',
    minutes: 2,
    maxXp: maxXpFor('fourCorners'),
    hasPoints: true,
    launch: { kind: 'route', route: 'fourCorners' },
    playedAs: ['fourCorners'],
  },
  {
    id: 'petJeopardy',
    name: t('Pet Jeopardy'),
    blurb: t('Pick three squares, then wager it all on the final.'),
    category: 'TRIVIA',
    minutes: 4,
    maxXp: JEOPARDY_MAX_XP,
    hasPoints: true,
    launch: { kind: 'route', route: 'petJeopardy' },
    playedAs: ['petJeopardy'],
  },
  {
    id: 'wordPuzzle',
    name: t("Today's word puzzle"),
    blurb: t('One five-letter word a day, six guesses, one shot.'),
    category: 'WORDS',
    minutes: 4,
    maxXp: maxXpFor('wordPuzzle'),
    hasPoints: false,
    launch: { kind: 'route', route: 'wordPuzzle' },
    available: wordPuzzleAvailable,
    playedAs: ['wordPuzzle'],
  },
  {
    id: 'wordGarden',
    name: t('Word garden'),
    blurb: t('Grow words from one seed letter. Runs multiply.'),
    category: 'WORDS',
    minutes: 5,
    maxXp: maxXpFor('wordGarden'),
    hasPoints: true,
    launch: { kind: 'stage', stage: 'garden' },
    available: wordGardenAvailable,
    // `spellingBee` is this game's former id; old events still carry it.
    playedAs: ['wordGarden', 'spellingBee'],
  },
  {
    id: 'countryGuess',
    name: t('Guess the country'),
    blurb: t('Three mystery countries, narrowed by distance.'),
    category: 'GEOGRAPHY',
    minutes: 4,
    maxXp: maxXpFor('countryGuess'),
    hasPoints: false,
    launch: { kind: 'stage', stage: 'country' },
    playedAs: ['countryGuess'],
  },
  {
    id: 'math',
    name: t('Quick maths'),
    blurb: t('Your pet runs, you solve — {seconds}s or {lives} hits before the run ends.', { seconds: MATH_RUN_SECONDS, lives: MATH_RUN_LIVES }),
    category: 'LOGIC',
    minutes: MATH_RUN_MINUTES,
    maxXp: maxXpFor('math'),
    hasPoints: false,
    launch: { kind: 'stage', stage: 'math' },
    playedAs: ['math'],
  },
  {
    id: 'reading',
    name: t('Read and recall'),
    blurb: t('A short passage, then questions from memory.'),
    category: 'MEMORY',
    minutes: 3,
    maxXp: maxXpFor('reading'),
    hasPoints: false,
    launch: { kind: 'stage', stage: 'reading' },
    playedAs: ['reading'],
  },
];
