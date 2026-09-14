import type { JeopardyCategory, JeopardyQuestion } from '../domain/petJeopardy';

/**
 * Pet Jeopardy's board content.
 *
 * Authoring rules (deliberately the same shape as `triviaQuestions.ts`, so a
 * contributor who has added a Four Corners question already knows this file):
 * - **The correct answer is always first.** `createJeopardyGame` shuffles the
 *   three options onto the tiles, so this file never thinks about layout.
 * - Exactly three answers, all distinct, all short enough to read on one line of
 *   an answer tile on a small phone.
 * - `value` is the board tier the question belongs to, and difficulty must rise
 *   with it: 100 should be near-common knowledge, 300 should make a college-age
 *   player stop and think. A misfiled question makes the board feel arbitrary,
 *   which is the one thing the value ladder exists to prevent.
 * - At least one question per (category, value) pair, or `createJeopardyGame`
 *   refuses to deal that board rather than showing a hole in it. More than one
 *   is better — the extras are what stop a second round repeating the first.
 *
 * Adding a category later is a new entry in {@link jeopardyCategories} plus rows
 * here; the board engine reads both generically and needs no change.
 */
export const jeopardyCategories: readonly JeopardyCategory[] = [
  { id: 'science', label: 'Science' },
  { id: 'world', label: 'World' },
  { id: 'body', label: 'Body' },
];

export const jeopardyQuestions: readonly JeopardyQuestion[] = [
  // ---------------------------------------------------------------- Science
  {
    id: 'science-100-water',
    category: 'science',
    value: 100,
    prompt: 'What is the chemical formula for water?',
    answers: ['H2O', 'CO2', 'O2'],
  },
  {
    id: 'science-100-sun',
    category: 'science',
    value: 100,
    prompt: 'What kind of object is the Sun?',
    answers: ['A star', 'A planet', 'A comet'],
  },
  {
    id: 'science-100-gravity',
    category: 'science',
    value: 100,
    prompt: 'What force pulls objects toward the Earth?',
    answers: ['Gravity', 'Friction', 'Magnetism'],
  },
  {
    id: 'science-200-photosynthesis',
    category: 'science',
    value: 200,
    prompt: 'Which gas do plants take in to make food?',
    answers: ['Carbon dioxide', 'Oxygen', 'Nitrogen'],
  },
  {
    id: 'science-200-gold',
    category: 'science',
    value: 200,
    prompt: 'What is the chemical symbol for gold?',
    answers: ['Au', 'Ag', 'Gd'],
  },
  {
    id: 'science-200-speed-light',
    category: 'science',
    value: 200,
    prompt: 'Roughly how fast does light travel per second?',
    answers: ['300,000 km', '30,000 km', '3,000 km'],
  },
  {
    id: 'science-300-mitochondria',
    category: 'science',
    value: 300,
    prompt: 'Which cell part is called the powerhouse of the cell?',
    answers: ['Mitochondria', 'Ribosome', 'Golgi body'],
  },
  {
    id: 'science-300-noble-gas',
    category: 'science',
    value: 300,
    prompt: 'Which of these is a noble gas?',
    answers: ['Argon', 'Chlorine', 'Sulfur'],
  },
  {
    id: 'science-300-half-life',
    category: 'science',
    value: 300,
    prompt: 'Carbon dating measures the decay of which isotope?',
    answers: ['Carbon-14', 'Carbon-12', 'Carbon-16'],
  },

  // ------------------------------------------------------------------ World
  {
    id: 'world-100-japan',
    category: 'world',
    value: 100,
    prompt: 'What is the capital of Japan?',
    answers: ['Tokyo', 'Seoul', 'Beijing'],
  },
  {
    id: 'world-100-ocean',
    category: 'world',
    value: 100,
    prompt: 'What is the largest ocean on Earth?',
    answers: ['Pacific', 'Atlantic', 'Indian'],
  },
  {
    id: 'world-100-eiffel',
    category: 'world',
    value: 100,
    prompt: 'Which city is home to the Eiffel Tower?',
    answers: ['Paris', 'Rome', 'Vienna'],
  },
  {
    id: 'world-200-nile',
    category: 'world',
    value: 200,
    prompt: 'Which river runs through Cairo?',
    answers: ['The Nile', 'The Congo', 'The Niger'],
  },
  {
    id: 'world-200-desert',
    category: 'world',
    value: 200,
    prompt: 'Which is the largest hot desert?',
    answers: ['The Sahara', 'The Gobi', 'The Mojave'],
  },
  {
    id: 'world-200-continents',
    category: 'world',
    value: 200,
    prompt: 'Which continent has the most countries?',
    answers: ['Africa', 'Asia', 'Europe'],
  },
  {
    id: 'world-300-landlocked',
    category: 'world',
    value: 300,
    prompt: 'Which country is entirely surrounded by South Africa?',
    answers: ['Lesotho', 'Eswatini', 'Botswana'],
  },
  {
    id: 'world-300-currency',
    category: 'world',
    value: 300,
    prompt: 'What is the currency of Poland?',
    answers: ['The zloty', 'The koruna', 'The forint'],
  },
  {
    id: 'world-300-strait',
    category: 'world',
    value: 300,
    prompt: 'Which strait separates Europe from Africa?',
    answers: ['Gibraltar', 'Bosphorus', 'Hormuz'],
  },

  // ------------------------------------------------------------------- Body
  {
    id: 'body-100-heart',
    category: 'body',
    value: 100,
    prompt: 'Which organ pumps blood around the body?',
    answers: ['The heart', 'The liver', 'The lungs'],
  },
  {
    id: 'body-100-bones',
    category: 'body',
    value: 100,
    prompt: 'What protects the brain?',
    answers: ['The skull', 'The ribs', 'The spine'],
  },
  {
    id: 'body-100-sleep',
    category: 'body',
    value: 100,
    prompt: 'How many hours of sleep are adults usually advised to get?',
    answers: ['Seven to nine', 'Three to four', 'Eleven to twelve'],
  },
  {
    id: 'body-200-muscle',
    category: 'body',
    value: 200,
    prompt: 'Which is the largest muscle in the human body?',
    answers: ['Gluteus maximus', 'Biceps', 'Calf'],
  },
  {
    id: 'body-200-protein',
    category: 'body',
    value: 200,
    prompt: 'Which nutrient is most associated with repairing muscle?',
    answers: ['Protein', 'Sugar', 'Sodium'],
  },
  {
    id: 'body-200-hydration',
    category: 'body',
    value: 200,
    prompt: 'Roughly what share of the human body is water?',
    answers: ['About 60%', 'About 20%', 'About 90%'],
  },
  {
    id: 'body-300-bones-count',
    category: 'body',
    value: 300,
    prompt: 'How many bones are in an adult human body?',
    answers: ['206', '178', '243'],
  },
  {
    id: 'body-300-insulin',
    category: 'body',
    value: 300,
    prompt: 'Which organ produces insulin?',
    answers: ['The pancreas', 'The spleen', 'The thyroid'],
  },
  {
    id: 'body-300-vo2',
    category: 'body',
    value: 300,
    prompt: 'VO2 max measures the body’s maximum uptake of what?',
    answers: ['Oxygen', 'Glucose', 'Iron'],
  },
];

/**
 * Final Jeopardy's own pool, kept separate from the board.
 *
 * A final question is not a fourth value tier: it is asked once, for a stake the
 * player chose, so it has to be hard enough to feel like a gamble but never so
 * obscure that the wager was decided by luck alone. Roughly the board's 300
 * tier, with a wider subject range since it belongs to no category.
 */
export const jeopardyFinalQuestions: readonly JeopardyQuestion[] = [
  {
    id: 'final-shakespeare',
    category: 'final',
    value: 0,
    prompt: 'Which Shakespeare play features the line “To be, or not to be”?',
    answers: ['Hamlet', 'Macbeth', 'King Lear'],
  },
  {
    id: 'final-everest',
    category: 'final',
    value: 0,
    prompt: 'On the border of which two countries does Mount Everest sit?',
    answers: ['Nepal and China', 'India and Nepal', 'China and Bhutan'],
  },
  {
    id: 'final-periodic',
    category: 'final',
    value: 0,
    prompt: 'Which element has the atomic number 1?',
    answers: ['Hydrogen', 'Helium', 'Carbon'],
  },
  {
    id: 'final-olympics',
    category: 'final',
    value: 0,
    prompt: 'In which city were the first modern Olympic Games held?',
    answers: ['Athens', 'Paris', 'London'],
  },
  {
    id: 'final-longest-bone',
    category: 'final',
    value: 0,
    prompt: 'What is the longest bone in the human body?',
    answers: ['The femur', 'The tibia', 'The humerus'],
  },
  {
    id: 'final-moon',
    category: 'final',
    value: 0,
    prompt: 'Which decade saw the first Moon landing?',
    answers: ['The 1960s', 'The 1950s', 'The 1970s'],
  },
];
