import type { HealthEvent, MealMetadata } from './health';
import type { PetDelta } from './pet';

/**
 * Food effects: what a meal DOES to the pet, in one word and one line.
 *
 * The idea is the effect tag from a crafting game — eat something spicy and the
 * pet says "That was hot!" and wears a SPICY tag for a couple of hours. They are
 * read off the meal (its name, what the photo found, its macros), so a plate of
 * jalapeño nachos and a search hit for "hot wings" both come up spicy without
 * anyone tagging anything.
 *
 * Derived, never stored: `activeFoodEffects` re-reads recent meals, so an effect
 * ends when its time is up and reappears on a reload — the same rule as every
 * other status in the app. The stat nudges are small and on top of the meal's
 * own delta; the point is flavour, not a second nutrition engine.
 *
 * Effects come from what the plate IS — its name, what the photo found, its
 * macros — never from the nutrient flags the meal engine already pays for.
 * Triggering "Greens" off `vegetables: true` would have paid every salad an
 * extra health point on top of the meal's own bonus, quietly changing the
 * economy for the most common meal in the app.
 */

export type FoodEffectId =
  | 'spicy'
  | 'sugar_rush'
  | 'caffeinated'
  | 'protein_packed'
  | 'greens'
  | 'fresh'
  | 'comfort'
  | 'feast'
  | 'brain_food'
  | 'carb_loaded';

export interface FoodEffect {
  id: FoodEffectId;
  /** The tag. One word, so a stack of them stays readable. */
  label: string;
  /** What the pet says the moment it lands. */
  reaction: string;
  /** How long it shows for, from the meal's time. */
  durationMinutes: number;
  /** A small nudge on top of the meal's own delta. */
  delta: PetDelta;
}

interface FoodEffectRule extends FoodEffect {
  /** Words that trigger it, matched as whole words in the meal's text. */
  words?: readonly string[];
  /** A macro/flag test, for effects that are about amounts rather than names. */
  test?: (meal: MealMetadata) => boolean;
}

const HOUR = 60;

/**
 * Order is display order: the ones that say most about the plate first, so a
 * truncated list still shows what mattered.
 */
export const FOOD_EFFECT_RULES: readonly FoodEffectRule[] = [
  {
    id: 'spicy',
    label: 'Spicy',
    reaction: 'That was hot!',
    durationMinutes: 2 * HOUR,
    delta: { energy: 2 },
    words: ['spicy', 'hot sauce', 'hot wings', 'hot chicken', 'hot pot', 'extra hot', 'chili', 'chilli', 'chile', 'jalapeno', 'jalapeño', 'habanero', 'sriracha', 'curry', 'wasabi', 'buffalo', 'cayenne', 'kimchi', 'tabasco', 'szechuan', 'sichuan', 'vindaloo', 'nduja', 'pepperoncini', 'harissa', 'gochujang', 'chipotle'],
  },
  {
    id: 'sugar_rush',
    label: 'Sugar rush',
    reaction: 'Zoom zoom zoom!',
    durationMinutes: 1 * HOUR,
    delta: { happiness: 2 },
    words: ['candy', 'cake', 'cupcake', 'cookie', 'donut', 'doughnut', 'soda', 'cola', 'dessert', 'ice cream', 'chocolate', 'brownie', 'pastry', 'sweets', 'lollipop', 'milkshake', 'frosting', 'gummy', 'waffle', 'pancake'],
  },
  {
    id: 'caffeinated',
    label: 'Wired',
    reaction: 'Wide awake now.',
    durationMinutes: 3 * HOUR,
    delta: { energy: 3 },
    words: ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'matcha', 'energy drink', 'red bull', 'cold brew', 'mocha', 'black tea', 'yerba'],
  },
  {
    id: 'protein_packed',
    label: 'Protein',
    reaction: 'Gains incoming.',
    durationMinutes: 3 * HOUR,
    delta: { strength: 1 },
    test: (meal) => (meal.analysis?.macros.proteinGrams ?? 0) >= 30,
  },
  {
    id: 'greens',
    label: 'Greens',
    reaction: 'Leafy and lean.',
    durationMinutes: 2 * HOUR,
    delta: { health: 1 },
    words: ['salad', 'spinach', 'kale', 'broccoli', 'greens', 'lettuce', 'arugula', 'rocket', 'bok choy', 'cabbage', 'asparagus', 'zucchini', 'courgette', 'cucumber'],
  },
  {
    id: 'fresh',
    label: 'Fresh',
    reaction: 'Crisp and bright.',
    durationMinutes: 2 * HOUR,
    delta: { happiness: 1 },
    words: ['apple', 'banana', 'berry', 'berries', 'orange', 'mango', 'grape', 'melon', 'pineapple', 'peach', 'pear', 'kiwi', 'fruit', 'smoothie', 'strawberr', 'blueberr', 'raspberr', 'watermelon', 'cherries', 'plum', 'citrus'],
  },
  {
    id: 'comfort',
    label: 'Cozy',
    reaction: 'Warm and happy.',
    durationMinutes: 2 * HOUR,
    delta: { happiness: 2 },
    words: ['pizza', 'burger', 'fries', 'mac and cheese', 'macaroni', 'ramen', 'noodle', 'lasagna', 'lasagne', 'stew', 'casserole', 'dumpling', 'pasta', 'grilled cheese', 'nachos', 'pot pie', 'shepherd', 'chowder', 'mashed', 'risotto'],
  },
  {
    id: 'feast',
    label: 'Stuffed',
    reaction: 'Ugh. Too much.',
    durationMinutes: 2 * HOUR,
    // A food coma: a little slower, a little content.
    delta: { energy: -2, happiness: 1 },
    test: (meal) => (meal.analysis?.macros.calories ?? 0) >= 900,
  },
  {
    id: 'brain_food',
    label: 'Sharp',
    reaction: 'Thinking clearly.',
    durationMinutes: 3 * HOUR,
    delta: { mind: 2 },
    words: ['salmon', 'tuna', 'sardine', 'mackerel', 'trout', 'fish', 'walnut', 'almond', 'egg', 'eggs', 'avocado', 'blueberr', 'oats', 'oatmeal', 'seeds', 'nuts'],
  },
  {
    id: 'carb_loaded',
    label: 'Fuelled',
    reaction: 'Ready to run.',
    durationMinutes: 3 * HOUR,
    delta: { endurance: 1 },
    test: (meal) => (meal.analysis?.macros.carbsGrams ?? 0) >= 80,
  },
];

export const FOOD_EFFECT_BY_ID: Record<FoodEffectId, FoodEffect> = Object.fromEntries(
  FOOD_EFFECT_RULES.map(({ words: _w, test: _t, ...effect }) => [effect.id, effect]),
) as Record<FoodEffectId, FoodEffect>;

/** Everything the meal says about itself, lower-cased, for word matching. */
const mealText = (meal: MealMetadata): string =>
  [meal.analysis?.foodDescription, meal.analysis?.summary, ...(meal.analysis?.detectedFoods ?? [])]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whole-word matching, plurals allowed: "egg" finds "eggs" but not "eggplant",
 * "nuts" is not found in "donuts". A stem ending in "rr" ("strawberr") is a
 * prefix, so it covers strawberry and strawberries alike.
 */
const hasWord = (text: string, word: string): boolean => {
  const escaped = escape(word);
  if (/rr$/.test(word)) return new RegExp(`(^|[^a-z])${escaped}`, 'i').test(text);
  return new RegExp(`(^|[^a-z])${escaped}(s|es)?($|[^a-z])`, 'i').test(text);
};

/**
 * The effects one meal carries, in display order. At most three: past that a
 * plate reads as everything at once, which is the same as nothing.
 */
export const detectFoodEffects = (meal: MealMetadata): FoodEffect[] => {
  const text = mealText(meal);
  const found: FoodEffect[] = [];
  for (const rule of FOOD_EFFECT_RULES) {
    const byWord = rule.words?.some((word) => hasWord(text, word)) ?? false;
    const byTest = rule.test?.(meal) ?? false;
    if (byWord || byTest) {
      const { words: _w, test: _t, ...effect } = rule;
      found.push(effect);
    }
  }
  return found.slice(0, 3);
};

export const MAX_ACTIVE_FOOD_EFFECTS = 3;

/**
 * Effects still running now, newest meal first, one entry per effect.
 *
 * Read off recent MEAL events rather than kept anywhere: an effect ends when
 * its duration is up whether or not the app was open, and survives a reload.
 */
export const activeFoodEffects = (events: readonly HealthEvent[], now: Date = new Date()): FoodEffect[] => {
  const active: FoodEffect[] = [];
  const seen = new Set<FoodEffectId>();
  const meals = events
    .filter((event) => event.type === 'MEAL')
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  for (const meal of meals) {
    const ageMinutes = (now.getTime() - new Date(meal.occurredAt).getTime()) / 60_000;
    if (ageMinutes < 0) continue;
    for (const effect of detectFoodEffects(meal.metadata as MealMetadata)) {
      if (seen.has(effect.id) || ageMinutes > effect.durationMinutes) continue;
      seen.add(effect.id);
      active.push(effect);
      if (active.length >= MAX_ACTIVE_FOOD_EFFECTS) return active;
    }
  }
  return active;
};

/** The combined stat nudge of a set of effects, for the engine. */
export const foodEffectsDelta = (effects: readonly FoodEffect[]): PetDelta => {
  const total: PetDelta = {};
  for (const effect of effects) {
    for (const [key, value] of Object.entries(effect.delta) as [keyof PetDelta, number][]) {
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
};
