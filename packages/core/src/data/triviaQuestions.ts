import type { TriviaQuestion } from '../domain/fourCorners';
import { msg } from '../i18n';

/**
 * Four Corners' question pool.
 *
 * Authoring rules:
 * - **The correct answer is always first.** `createFourCornersRound` shuffles
 *   them onto the corners, so this file never thinks about layout.
 * - Exactly four answers, all distinct, all short enough to read inside a corner
 *   tile on a small phone (roughly two words).
 * - College-age general knowledge: recognisable without being a gimme, and the
 *   three wrong answers should be plausible members of the same set.
 *
 * Adding a category later is a new `TriviaCategory` value plus more rows here —
 * the round engine already carries `category` through untouched.
 */
export const triviaQuestions: readonly TriviaQuestion[] = [
  {
    id: 'general-red-planet',
    category: 'general',
    prompt: msg('Which planet is known as the Red Planet?'),
    answers: [msg('Mars'), msg('Venus'), msg('Jupiter'), msg('Saturn')],
  },
  {
    id: 'general-largest-ocean',
    category: 'general',
    prompt: msg('What is the largest ocean on Earth?'),
    answers: [msg('Pacific'), msg('Atlantic'), msg('Indian'), msg('Arctic')],
  },
  {
    id: 'general-japan-capital',
    category: 'general',
    prompt: msg('What is the capital of Japan?'),
    answers: [msg('Tokyo'), msg('Seoul'), msg('Beijing'), msg('Bangkok')],
  },
  {
    id: 'general-gold-symbol',
    category: 'general',
    prompt: msg('What is the chemical symbol for gold?'),
    answers: [msg('Au'), msg('Ag'), msg('Gd'), msg('Go')],
  },
  {
    id: 'general-mona-lisa',
    category: 'general',
    prompt: msg('Who painted the Mona Lisa?'),
    answers: [msg('Da Vinci'), msg('Michelangelo'), msg('Raphael'), msg('Donatello')],
  },
  {
    id: 'general-longest-river',
    category: 'general',
    prompt: msg('Which is the longest river in the world?'),
    answers: [msg('The Nile'), msg('The Amazon'), msg('The Yangtze'), msg('The Danube')],
  },
  {
    id: 'general-bones-hand',
    category: 'general',
    prompt: msg('Which organ pumps blood around the body?'),
    answers: [msg('The heart'), msg('The liver'), msg('The lungs'), msg('The kidneys')],
  },
  {
    id: 'general-continents',
    category: 'general',
    prompt: msg('How many continents are there?'),
    answers: [msg('Seven'), msg('Five'), msg('Six'), msg('Eight')],
  },
  {
    id: 'general-fastest-land',
    category: 'general',
    prompt: msg('What is the fastest land animal?'),
    answers: [msg('Cheetah'), msg('Lion'), msg('Greyhound'), msg('Pronghorn')],
  },
  {
    id: 'general-sun-star',
    category: 'general',
    prompt: msg('What kind of object is the Sun?'),
    answers: [msg('A star'), msg('A planet'), msg('A comet'), msg('A moon')],
  },
  {
    id: 'general-great-wall',
    category: 'general',
    prompt: msg('In which country is the Great Wall?'),
    answers: [msg('China'), msg('Japan'), msg('India'), msg('Mongolia')],
  },
  {
    id: 'general-freezing-point',
    category: 'general',
    prompt: msg('Water freezes at what Celsius temperature?'),
    answers: [msg('0 degrees'), msg('10 degrees'), msg('32 degrees'), msg('-10 degrees')],
  },
  {
    id: 'general-romeo-author',
    category: 'general',
    prompt: msg('Who wrote Romeo and Juliet?'),
    answers: [msg('Shakespeare'), msg('Dickens'), msg('Chaucer'), msg('Austen')],
  },
  {
    id: 'general-sides-hexagon',
    category: 'general',
    prompt: msg('How many sides does a hexagon have?'),
    answers: [msg('Six'), msg('Five'), msg('Seven'), msg('Eight')],
  },
  {
    id: 'general-olympics-years',
    category: 'general',
    prompt: msg('How often are the Summer Olympics held?'),
    answers: [msg('Every 4 years'), msg('Every 2 years'), msg('Every 3 years'), msg('Every 5 years')],
  },
  {
    id: 'general-largest-desert',
    category: 'general',
    prompt: msg('Which is the largest hot desert?'),
    answers: [msg('The Sahara'), msg('The Gobi'), msg('The Kalahari'), msg('The Mojave')],
  },
  {
    id: 'general-photosynthesis-gas',
    category: 'general',
    prompt: msg('Which gas do plants take in to make food?'),
    answers: [msg('Carbon dioxide'), msg('Oxygen'), msg('Nitrogen'), msg('Hydrogen')],
  },
  {
    id: 'general-moon-landing',
    category: 'general',
    prompt: msg('Which decade saw the first Moon landing?'),
    answers: [msg('The 1960s'), msg('The 1950s'), msg('The 1970s'), msg('The 1980s')],
  },
  {
    id: 'general-eiffel-city',
    category: 'general',
    prompt: msg('Which city is home to the Eiffel Tower?'),
    answers: [msg('Paris'), msg('Rome'), msg('Vienna'), msg('Brussels')],
  },
  {
    id: 'general-piano-keys',
    category: 'general',
    prompt: msg('A standard piano has how many keys?'),
    answers: [msg('88'), msg('76'), msg('61'), msg('96')],
  },
];
