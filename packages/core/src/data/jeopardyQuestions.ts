import type { JeopardyCategory, JeopardyQuestion } from '../domain/petJeopardy';
import { msg } from '../i18n';

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
  { id: 'science', label: msg('Science') },
  { id: 'world', label: msg('World') },
  { id: 'body', label: msg('Body') },
];

export const jeopardyQuestions: readonly JeopardyQuestion[] = [
  // ---------------------------------------------------------------- Science
  {
    id: 'science-100-water',
    category: 'science',
    value: 100,
    prompt: msg('What is the chemical formula for water?'),
    answers: [msg('H2O'), msg('CO2'), msg('O2')],
  },
  {
    id: 'science-100-sun',
    category: 'science',
    value: 100,
    prompt: msg('What kind of object is the Sun?'),
    answers: [msg('A star'), msg('A planet'), msg('A comet')],
  },
  {
    id: 'science-100-gravity',
    category: 'science',
    value: 100,
    prompt: msg('What force pulls objects toward the Earth?'),
    answers: [msg('Gravity'), msg('Friction'), msg('Magnetism')],
  },
  {
    id: 'science-200-photosynthesis',
    category: 'science',
    value: 200,
    prompt: msg('Which gas do plants take in to make food?'),
    answers: [msg('Carbon dioxide'), msg('Oxygen'), msg('Nitrogen')],
  },
  {
    id: 'science-200-gold',
    category: 'science',
    value: 200,
    prompt: msg('What is the chemical symbol for gold?'),
    answers: [msg('Au'), msg('Ag'), msg('Gd')],
  },
  {
    id: 'science-200-speed-light',
    category: 'science',
    value: 200,
    prompt: msg('Roughly how fast does light travel per second?'),
    answers: [msg('300,000 km'), msg('30,000 km'), msg('3,000 km')],
  },
  {
    id: 'science-300-mitochondria',
    category: 'science',
    value: 300,
    prompt: msg('Which cell part is called the powerhouse of the cell?'),
    answers: [msg('Mitochondria'), msg('Ribosome'), msg('Golgi body')],
  },
  {
    id: 'science-300-noble-gas',
    category: 'science',
    value: 300,
    prompt: msg('Which of these is a noble gas?'),
    answers: [msg('Argon'), msg('Chlorine'), msg('Sulfur')],
  },
  {
    id: 'science-300-half-life',
    category: 'science',
    value: 300,
    prompt: msg('Carbon dating measures the decay of which isotope?'),
    answers: [msg('Carbon-14'), msg('Carbon-12'), msg('Carbon-16')],
  },

  // ------------------------------------------------------------------ World
  {
    id: 'world-100-japan',
    category: 'world',
    value: 100,
    prompt: msg('What is the capital of Japan?'),
    answers: [msg('Tokyo'), msg('Seoul'), msg('Beijing')],
  },
  {
    id: 'world-100-ocean',
    category: 'world',
    value: 100,
    prompt: msg('What is the largest ocean on Earth?'),
    answers: [msg('Pacific'), msg('Atlantic'), msg('Indian')],
  },
  {
    id: 'world-100-eiffel',
    category: 'world',
    value: 100,
    prompt: msg('Which city is home to the Eiffel Tower?'),
    answers: [msg('Paris'), msg('Rome'), msg('Vienna')],
  },
  {
    id: 'world-200-nile',
    category: 'world',
    value: 200,
    prompt: msg('Which river runs through Cairo?'),
    answers: [msg('The Nile'), msg('The Congo'), msg('The Niger')],
  },
  {
    id: 'world-200-desert',
    category: 'world',
    value: 200,
    prompt: msg('Which is the largest hot desert?'),
    answers: [msg('The Sahara'), msg('The Gobi'), msg('The Mojave')],
  },
  {
    id: 'world-200-continents',
    category: 'world',
    value: 200,
    prompt: msg('Which continent has the most countries?'),
    answers: [msg('Africa'), msg('Asia'), msg('Europe')],
  },
  {
    id: 'world-300-landlocked',
    category: 'world',
    value: 300,
    prompt: msg('Which country is entirely surrounded by South Africa?'),
    answers: [msg('Lesotho'), msg('Eswatini'), msg('Botswana')],
  },
  {
    id: 'world-300-currency',
    category: 'world',
    value: 300,
    prompt: msg('What is the currency of Poland?'),
    answers: [msg('The zloty'), msg('The koruna'), msg('The forint')],
  },
  {
    id: 'world-300-strait',
    category: 'world',
    value: 300,
    prompt: msg('Which strait separates Europe from Africa?'),
    answers: [msg('Gibraltar'), msg('Bosphorus'), msg('Hormuz')],
  },

  // ------------------------------------------------------------------- Body
  {
    id: 'body-100-heart',
    category: 'body',
    value: 100,
    prompt: msg('Which organ pumps blood around the body?'),
    answers: [msg('The heart'), msg('The liver'), msg('The lungs')],
  },
  {
    id: 'body-100-bones',
    category: 'body',
    value: 100,
    prompt: msg('What protects the brain?'),
    answers: [msg('The skull'), msg('The ribs'), msg('The spine')],
  },
  {
    id: 'body-100-sleep',
    category: 'body',
    value: 100,
    prompt: msg('How many hours of sleep are adults usually advised to get?'),
    answers: [msg('Seven to nine'), msg('Three to four'), msg('Eleven to twelve')],
  },
  {
    id: 'body-200-muscle',
    category: 'body',
    value: 200,
    prompt: msg('Which is the largest muscle in the human body?'),
    answers: [msg('Gluteus maximus'), msg('Biceps'), msg('Calf')],
  },
  {
    id: 'body-200-protein',
    category: 'body',
    value: 200,
    prompt: msg('Which nutrient is most associated with repairing muscle?'),
    answers: [msg('Protein'), msg('Sugar'), msg('Sodium')],
  },
  {
    id: 'body-200-hydration',
    category: 'body',
    value: 200,
    prompt: msg('Roughly what share of the human body is water?'),
    answers: [msg('About 60%'), msg('About 20%'), msg('About 90%')],
  },
  {
    id: 'body-300-bones-count',
    category: 'body',
    value: 300,
    prompt: msg('How many bones are in an adult human body?'),
    answers: [msg('206'), msg('178'), msg('243')],
  },
  {
    id: 'body-300-insulin',
    category: 'body',
    value: 300,
    prompt: msg('Which organ produces insulin?'),
    answers: [msg('The pancreas'), msg('The spleen'), msg('The thyroid')],
  },
  {
    id: 'body-300-vo2',
    category: 'body',
    value: 300,
    prompt: msg('VO2 max measures the body’s maximum uptake of what?'),
    answers: [msg('Oxygen'), msg('Glucose'), msg('Iron')],
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
    prompt: msg('Which Shakespeare play features the line “To be, or not to be”?'),
    answers: [msg('Hamlet'), msg('Macbeth'), msg('King Lear')],
  },
  {
    id: 'final-everest',
    category: 'final',
    value: 0,
    prompt: msg('On the border of which two countries does Mount Everest sit?'),
    answers: [msg('Nepal and China'), msg('India and Nepal'), msg('China and Bhutan')],
  },
  {
    id: 'final-periodic',
    category: 'final',
    value: 0,
    prompt: msg('Which element has the atomic number 1?'),
    answers: [msg('Hydrogen'), msg('Helium'), msg('Carbon')],
  },
  {
    id: 'final-olympics',
    category: 'final',
    value: 0,
    prompt: msg('In which city were the first modern Olympic Games held?'),
    answers: [msg('Athens'), msg('Paris'), msg('London')],
  },
  {
    id: 'final-longest-bone',
    category: 'final',
    value: 0,
    prompt: msg('What is the longest bone in the human body?'),
    answers: [msg('The femur'), msg('The tibia'), msg('The humerus')],
  },
  {
    id: 'final-moon',
    category: 'final',
    value: 0,
    prompt: msg('Which decade saw the first Moon landing?'),
    answers: [msg('The 1960s'), msg('The 1950s'), msg('The 1970s')],
  },
];
