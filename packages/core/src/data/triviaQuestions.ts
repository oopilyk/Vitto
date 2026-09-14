import type { TriviaQuestion } from '../domain/fourCorners';

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
    prompt: 'Which planet is known as the Red Planet?',
    answers: ['Mars', 'Venus', 'Jupiter', 'Saturn'],
  },
  {
    id: 'general-largest-ocean',
    category: 'general',
    prompt: 'What is the largest ocean on Earth?',
    answers: ['Pacific', 'Atlantic', 'Indian', 'Arctic'],
  },
  {
    id: 'general-japan-capital',
    category: 'general',
    prompt: 'What is the capital of Japan?',
    answers: ['Tokyo', 'Seoul', 'Beijing', 'Bangkok'],
  },
  {
    id: 'general-gold-symbol',
    category: 'general',
    prompt: 'What is the chemical symbol for gold?',
    answers: ['Au', 'Ag', 'Gd', 'Go'],
  },
  {
    id: 'general-mona-lisa',
    category: 'general',
    prompt: 'Who painted the Mona Lisa?',
    answers: ['Da Vinci', 'Michelangelo', 'Raphael', 'Donatello'],
  },
  {
    id: 'general-longest-river',
    category: 'general',
    prompt: 'Which is the longest river in the world?',
    answers: ['The Nile', 'The Amazon', 'The Yangtze', 'The Danube'],
  },
  {
    id: 'general-bones-hand',
    category: 'general',
    prompt: 'Which organ pumps blood around the body?',
    answers: ['The heart', 'The liver', 'The lungs', 'The kidneys'],
  },
  {
    id: 'general-continents',
    category: 'general',
    prompt: 'How many continents are there?',
    answers: ['Seven', 'Five', 'Six', 'Eight'],
  },
  {
    id: 'general-fastest-land',
    category: 'general',
    prompt: 'What is the fastest land animal?',
    answers: ['Cheetah', 'Lion', 'Greyhound', 'Pronghorn'],
  },
  {
    id: 'general-sun-star',
    category: 'general',
    prompt: 'What kind of object is the Sun?',
    answers: ['A star', 'A planet', 'A comet', 'A moon'],
  },
  {
    id: 'general-great-wall',
    category: 'general',
    prompt: 'In which country is the Great Wall?',
    answers: ['China', 'Japan', 'India', 'Mongolia'],
  },
  {
    id: 'general-freezing-point',
    category: 'general',
    prompt: 'Water freezes at what Celsius temperature?',
    answers: ['0 degrees', '10 degrees', '32 degrees', '-10 degrees'],
  },
  {
    id: 'general-romeo-author',
    category: 'general',
    prompt: 'Who wrote Romeo and Juliet?',
    answers: ['Shakespeare', 'Dickens', 'Chaucer', 'Austen'],
  },
  {
    id: 'general-sides-hexagon',
    category: 'general',
    prompt: 'How many sides does a hexagon have?',
    answers: ['Six', 'Five', 'Seven', 'Eight'],
  },
  {
    id: 'general-olympics-years',
    category: 'general',
    prompt: 'How often are the Summer Olympics held?',
    answers: ['Every 4 years', 'Every 2 years', 'Every 3 years', 'Every 5 years'],
  },
  {
    id: 'general-largest-desert',
    category: 'general',
    prompt: 'Which is the largest hot desert?',
    answers: ['The Sahara', 'The Gobi', 'The Kalahari', 'The Mojave'],
  },
  {
    id: 'general-photosynthesis-gas',
    category: 'general',
    prompt: 'Which gas do plants take in to make food?',
    answers: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'],
  },
  {
    id: 'general-moon-landing',
    category: 'general',
    prompt: 'Which decade saw the first Moon landing?',
    answers: ['The 1960s', 'The 1950s', 'The 1970s', 'The 1980s'],
  },
  {
    id: 'general-eiffel-city',
    category: 'general',
    prompt: 'Which city is home to the Eiffel Tower?',
    answers: ['Paris', 'Rome', 'Vienna', 'Brussels'],
  },
  {
    id: 'general-piano-keys',
    category: 'general',
    prompt: 'A standard piano has how many keys?',
    answers: ['88', '76', '61', '96'],
  },
];
