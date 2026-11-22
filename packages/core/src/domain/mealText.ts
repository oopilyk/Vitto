import { servingGrams, type FoodSearchResult, type PortionUnit } from '../foodDatabase';

/**
 * A meal typed or said in a sentence ("2 eggs, 150 g chicken breast and a
 * banana"), read without a model when it is plain enough to be read that way.
 *
 * This is the free, instant half of "describe your meal". It only ever answers
 * when it is sure: every food has to be a plain name with a plain amount, and
 * (in `matchParsedItem`) the database has to carry a food of exactly that name
 * with a serving the amount can be counted in. Anything else ("a big bowl of
 * my mum's curry", "toast with butter") returns null and goes to the model,
 * which is what it is for. A wrong confident answer is worse than a slow right
 * one, so when in doubt this says no.
 */

export type MealTextUnit = 'count' | 'g' | 'oz' | 'cup' | 'tbsp' | 'tsp' | 'slice' | 'piece';

export interface ParsedMealItem {
  /** The food as it was said, amount removed: "chicken breast". */
  name: string;
  amount: number;
  unit: MealTextUnit;
  /** False when no amount was said ("a banana" is said; "banana" is not). */
  explicit: boolean;
}

/** More foods than this in one sentence is a list worth a second look: the model takes it. */
const MAX_ITEMS = 8;
const MAX_NAME_WORDS = 4;

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5,
};

/** Each unit as people write it, and what it counts in (with a factor, for kg and lb). */
const UNITS: Record<string, { unit: MealTextUnit; factor: number }> = {
  g: { unit: 'g', factor: 1 }, gram: { unit: 'g', factor: 1 }, grams: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 }, kilo: { unit: 'g', factor: 1000 }, kilos: { unit: 'g', factor: 1000 },
  oz: { unit: 'oz', factor: 1 }, ounce: { unit: 'oz', factor: 1 }, ounces: { unit: 'oz', factor: 1 },
  lb: { unit: 'oz', factor: 16 }, lbs: { unit: 'oz', factor: 16 }, pound: { unit: 'oz', factor: 16 }, pounds: { unit: 'oz', factor: 16 },
  cup: { unit: 'cup', factor: 1 }, cups: { unit: 'cup', factor: 1 },
  tbsp: { unit: 'tbsp', factor: 1 }, tablespoon: { unit: 'tbsp', factor: 1 }, tablespoons: { unit: 'tbsp', factor: 1 },
  tsp: { unit: 'tsp', factor: 1 }, teaspoon: { unit: 'tsp', factor: 1 }, teaspoons: { unit: 'tsp', factor: 1 },
  slice: { unit: 'slice', factor: 1 }, slices: { unit: 'slice', factor: 1 },
  piece: { unit: 'piece', factor: 1 }, pieces: { unit: 'piece', factor: 1 },
};

/**
 * Words that mean a judgment is needed: a size, a container, a guess, a
 * dish made of other things, someone's own recipe. One of these in a food's
 * name and the sentence is the model's.
 */
const NEEDS_JUDGMENT = new Set([
  'big', 'large', 'small', 'medium', 'huge', 'little', 'tiny', 'giant', 'mini', 'regular', 'double', 'triple',
  'handful', 'bowl', 'plate', 'glass', 'mug', 'bottle', 'can', 'pack', 'packet', 'bag', 'box', 'scoop', 'serving', 'portion', 'splash', 'dash', 'pinch',
  'some', 'few', 'couple', 'bit', 'lot', 'lots', 'bunch', 'about', 'around', 'roughly', 'maybe', 'probably', 'like',
  'my', 'our', 'usual', 'leftover', 'leftovers', 'homemade', 'same', 'other', 'another', 'more', 'extra', 'no', 'without', 'with',
  'in', 'on', 'from', 'of', 'the', 'at', 'for', 'half', 'quarter', 'whole',
]);

/**
 * Foods with "and" in their own name. Split at that "and", "mac and cheese"
 * would be two foods, one of them "mac".
 */
const AND_FOODS = [
  'mac and cheese', 'macaroni and cheese', 'fish and chips', 'rice and beans', 'beans and rice', 'peanut butter and jelly', 'pb and j',
  'ham and cheese', 'cookies and cream', 'half and half', 'surf and turf', 'biscuits and gravy', 'chicken and waffles', 'bangers and mash',
  'sweet and sour', 'salt and vinegar', 'sour cream and onion', 'chips and salsa', 'chips and guac', 'chips and guacamole', 'bacon and eggs',
  'bacon egg and cheese', 'sausage egg and cheese', 'strawberries and cream', 'peas and carrots', 'spaghetti and meatballs', 'franks and beans',
];
/** Stands in for the spaces of an AND_FOODS name while the sentence is split: a word character, so its "and" is not a word. */
const JOIN = '_';

/** "I had", "for breakfast I ate": how a spoken sentence starts, and nothing to log. */
const LEAD_IN = /^(?:(?:today|this morning|tonight|earlier|just now|for (?:breakfast|brunch|lunch|dinner|dessert|a snack|my snack))[, ]+)*(?:(?:i|we)(?:'ve| have)? )?(?:just )?(?:had|ate|eaten|drank|have|got)\s+/;
const TAIL = /\s+(?:for (?:breakfast|brunch|lunch|dinner|dessert|a snack)|today|this morning|tonight)$/;

const toAmount = (raw: string): number | null => {
  const word = NUMBER_WORDS[raw];
  if (word !== undefined) return word;
  // "1 1/2", "1/2", "1.5", "2"
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(raw);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)$/.exec(raw);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

// A digit may touch its unit ("150g"); a word must end ("an apple" is not "a" + "n apple").
const AMOUNT = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|(?:${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')})\b)`;
const UNIT = `(${Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|')})`;
/** "150g chicken", "2 cups of rice", "a banana", "3 eggs", "oatmeal". */
const SEGMENT = new RegExp(String.raw`^(?:${AMOUNT}\s*)?(?:${UNIT}\b\.?\s+(?:of\s+)?)?([a-z][a-z' -]*)$`);

const parseSegment = (segment: string): ParsedMealItem | null => {
  // "half a banana", "half an avocado": the half is the amount.
  const text = segment.replace(/^half an? /, 'half ');
  const match = SEGMENT.exec(text);
  if (!match) return null;
  const [, rawAmount, rawUnit, rawName] = match;
  const name = rawName!.replace(/\s+/g, ' ').trim();
  const words = name.split(' ');
  if (!name || words.length > MAX_NAME_WORDS || words.some((word) => NEEDS_JUDGMENT.has(word) || word in UNITS || word in NUMBER_WORDS)) return null;

  const amount = rawAmount === undefined ? 1 : toAmount(rawAmount);
  if (amount === null || amount <= 0 || amount > 5000) return null;
  const unit = rawUnit ? UNITS[rawUnit]! : { unit: 'count' as const, factor: 1 };
  // A count is a few of something: "200 chicken" forgot its unit.
  if (unit.unit === 'count' && amount > 24) return null;
  return { name, amount: amount * unit.factor, unit: unit.unit, explicit: rawAmount !== undefined };
};

/**
 * The foods in a sentence, each with its amount, or null when any part of it
 * needs judgment. Null is the common answer for speech, and a fine one.
 */
export const parseMealText = (text: string): ParsedMealItem[] | null => {
  let said = text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/_/g, ' ')
    .replace(/[.!?]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  said = said.replace(LEAD_IN, '').replace(TAIL, '');
  if (!said) return null;
  for (const food of AND_FOODS) said = said.split(food).join(food.replace(/ /g, JOIN));

  const segments = said
    .split(/\s*(?:,|;|\n|\+|\band\b|\bplus\b|\bthen\b|\balso\b)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length === 0 || segments.length > MAX_ITEMS) return null;

  const items: ParsedMealItem[] = [];
  for (const segment of segments) {
    // A joined food is read as one hyphenated word, then given its spaces back.
    const joined = segment.includes(JOIN);
    const item = parseSegment(joined ? segment.split(JOIN).join('-') : segment);
    if (!item) return null;
    items.push(joined ? { ...item, name: AND_FOODS.reduce((name, food) => name.split(food.replace(/ /g, '-')).join(food), item.name) } : item);
  }
  return items;
};

const singular = (word: string): string => {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:oes|ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
};

/** A name as a set of its words, so "Eggs" is "egg" and "Breast, chicken" is "chicken breast". */
const nameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(singular)
    .sort()
    .join(' ');

const GRAMS_PER_OZ = 28.3495;
/** How far down a search's results a food of exactly this name is looked for. */
const MATCH_DEPTH = 6;
/** What a serving is counted in when it is not a thing ("1 cup", "100 g"): two eggs are not two of these. */
const MEASURES = /^(?:cup|tbsp|tablespoon|tsp|teaspoon|oz|ounce|fl|g|gram|ml|l|serving|portion)s?\b/;
const HOUSEHOLD: Record<Exclude<MealTextUnit, 'count' | 'g' | 'oz'>, RegExp> = {
  cup: /^cups?\b/,
  tbsp: /^(?:tbsp|tablespoons?)\b/,
  tsp: /^(?:tsp|teaspoons?)\b/,
  slice: /^slices?\b/,
  piece: /^pieces?\b/,
};

/** A serving's own amount and what follows it: "1/2 cup cooked" is 0.5 and "cup cooked". */
const servingLead = (description: string): { amount: number; rest: string } | null => {
  const match = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/.exec(description.trim().toLowerCase());
  const amount = match ? toAmount(match[1]!) : null;
  return match && amount && amount > 0 ? { amount, rest: match[2]! } : null;
};

export interface MatchedMealItem {
  food: FoodSearchResult;
  servings: number;
  unit: PortionUnit;
}

/**
 * The food a parsed item is, from that name's search results, and how many
 * servings of it the amount comes to. Null unless both are certain:
 *
 *   - the food is one whose whole name is the words that were said ("egg",
 *     "chicken breast"), not a brand's and not a variation ("Egg, white,
 *     dried"): choosing between variations is a judgment;
 *   - a weight is turned into servings by the food's own weight; a count
 *     needs a serving that is one of the thing ("1 large"), a cup needs a
 *     serving given in cups. "2 chicken breast" against "per 100 g" has no
 *     honest answer here.
 */
export const matchParsedItem = (item: ParsedMealItem, results: readonly FoodSearchResult[]): MatchedMealItem | null => {
  const wanted = nameKey(item.name);
  const food = results.slice(0, MATCH_DEPTH).find((result) => !result.brand && nameKey(result.name) === wanted);
  if (!food || !wanted) return null;

  if (item.unit === 'g' || item.unit === 'oz') {
    const grams = servingGrams(food);
    if (!grams) return null;
    return { food, servings: (item.unit === 'g' ? item.amount : item.amount * GRAMS_PER_OZ) / grams, unit: item.unit };
  }
  if (food.isPer100g) return null;
  const lead = servingLead(food.servingDescription);
  if (item.unit === 'count') {
    // No amount said: one serving of it, whatever a serving is.
    if (!item.explicit) return { food, servings: 1, unit: 'serving' };
    if (!lead || lead.amount !== 1 || MEASURES.test(lead.rest)) return null;
    return { food, servings: item.amount, unit: 'serving' };
  }
  if (!lead || !HOUSEHOLD[item.unit].test(lead.rest)) return null;
  return { food, servings: item.amount / lead.amount, unit: 'serving' };
};
