import type { HealthEvent, MealMetadata } from './health';
import type { PetDelta } from './pet';
import { msg, t } from '../i18n';

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
 *
 * The one thing read off the grade is "Junk": a D plate is the analyser saying
 * this was not a balanced meal, and the pet should say so too rather than
 * cheer "Gains incoming" over 240g of burger protein. On a D plate the
 * wholesome tags (Protein, Greens, Fresh, Sharp) stay off — a lettuce leaf on
 * a burger does not make the plate leafy and lean — while the flavour tags
 * (Spicy, Sugar rush, Cozy, Stuffed) still read true.
 */

export type FoodEffectId =
  | 'junk'
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
  /**
   * The tag. One word, so a stack of them stays readable. Kept in English (the
   * companion is sent it as it is): draw it with `t(effect.label)`.
   */
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
  /**
   * The same in Spanish (whole words) and Chinese (anywhere in the text): a
   * meal read from a photo is described in the app's language, and these are
   * what the effect is found by there. Matched whatever language the app is in.
   */
  es?: readonly string[];
  zh?: readonly string[];
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
    id: 'junk',
    label: msg('Junk'),
    reaction: t('Greasy. Not feeling great.'),
    durationMinutes: 2 * HOUR,
    // The grade already decides the meal's own (small) delta; this is the
    // after-effect, and the only effect that costs anything.
    delta: { health: -1, charge: -1 },
    test: (meal) => meal.analysis?.grade === 'D',
  },
  {
    id: 'spicy',
    label: msg('Spicy'),
    reaction: t('That was hot!'),
    durationMinutes: 2 * HOUR,
    delta: { charge: 2 },
    words: ['spicy', 'hot sauce', 'hot wings', 'hot chicken', 'hot pot', 'extra hot', 'chili', 'chilli', 'chile', 'jalapeno', 'jalapeño', 'habanero', 'sriracha', 'curry', 'wasabi', 'buffalo', 'cayenne', 'kimchi', 'tabasco', 'szechuan', 'sichuan', 'vindaloo', 'nduja', 'pepperoncini', 'harissa', 'gochujang', 'chipotle'],
    es: ['picante', 'picantes', 'ají', 'jalapeño', 'habanero', 'curry', 'wasabi', 'kimchi', 'sriracha', 'chipotle', 'guindilla'],
    zh: ['辣', '咖喱', '芥末', '泡菜', '麻婆', '火锅', '川菜'],
  },
  {
    id: 'sugar_rush',
    label: msg('Sugar rush'),
    reaction: t('Zoom zoom zoom!'),
    durationMinutes: 1 * HOUR,
    delta: { happiness: 2 },
    words: ['candy', 'cake', 'cupcake', 'cookie', 'donut', 'doughnut', 'soda', 'cola', 'dessert', 'ice cream', 'chocolate', 'brownie', 'pastry', 'sweets', 'lollipop', 'milkshake', 'frosting', 'gummy', 'waffle', 'pancake'],
    es: ['caramelo', 'pastel', 'tarta', 'galleta', 'dona', 'rosquilla', 'refresco', 'gaseosa', 'postre', 'helado', 'chocolate', 'bizcocho', 'dulces', 'malteada', 'gofre', 'panqueque', 'tortitas', 'churro', 'flan'],
    zh: ['糖果', '蛋糕', '饼干', '甜甜圈', '汽水', '可乐', '甜点', '甜品', '冰淇淋', '巧克力', '布朗尼', '奶昔', '华夫', '松饼', '奶茶'],
  },
  {
    id: 'caffeinated',
    label: msg('Wired'),
    reaction: t('Wide awake now.'),
    durationMinutes: 3 * HOUR,
    delta: { charge: 3 },
    words: ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'matcha', 'energy drink', 'red bull', 'cold brew', 'mocha', 'black tea', 'yerba'],
    es: ['café', 'espresso', 'expreso', 'latte', 'capuchino', 'cappuccino', 'americano', 'matcha', 'bebida energética', 'té negro', 'cortado'],
    zh: ['咖啡', '拿铁', '卡布奇诺', '美式', '抹茶', '能量饮料', '红牛', '冷萃', '摩卡', '红茶'],
  },
  {
    id: 'protein_packed',
    label: msg('Protein'),
    reaction: t('Gains incoming.'),
    durationMinutes: 3 * HOUR,
    delta: { strength: 1 },
    test: (meal) => (meal.analysis?.macros.proteinGrams ?? 0) >= 30,
  },
  {
    id: 'greens',
    label: msg('Greens'),
    reaction: t('Leafy and lean.'),
    durationMinutes: 2 * HOUR,
    delta: { health: 1 },
    words: ['salad', 'spinach', 'kale', 'broccoli', 'greens', 'lettuce', 'arugula', 'rocket', 'bok choy', 'cabbage', 'asparagus', 'zucchini', 'courgette', 'cucumber'],
    es: ['ensalada', 'espinaca', 'col rizada', 'brócoli', 'lechuga', 'rúcula', 'repollo', 'espárrago', 'calabacín', 'pepino', 'acelga'],
    zh: ['沙拉', '菠菜', '羽衣甘蓝', '西兰花', '生菜', '青菜', '白菜', '卷心菜', '芦笋', '西葫芦', '黄瓜', '油菜', '芝麻菜'],
  },
  {
    id: 'fresh',
    label: msg('Fresh'),
    reaction: t('Crisp and bright.'),
    durationMinutes: 2 * HOUR,
    delta: { happiness: 1 },
    words: ['apple', 'banana', 'berry', 'berries', 'orange', 'mango', 'grape', 'melon', 'pineapple', 'peach', 'pear', 'kiwi', 'fruit', 'smoothie', 'strawberr', 'blueberr', 'raspberr', 'watermelon', 'cherries', 'plum', 'citrus'],
    es: ['manzana', 'plátano', 'banana', 'fresa', 'naranja', 'mango', 'uva', 'melón', 'piña', 'durazno', 'melocotón', 'pera', 'kiwi', 'fruta', 'arándano', 'frambuesa', 'sandía', 'cereza', 'ciruela', 'licuado'],
    zh: ['苹果', '香蕉', '莓', '橙', '芒果', '葡萄', '西瓜', '哈密瓜', '甜瓜', '菠萝', '桃子', '水蜜桃', '梨', '猕猴桃', '水果', '果昔', '樱桃', '李子', '柚子'],
  },
  {
    id: 'comfort',
    label: msg('Cozy'),
    reaction: t('Warm and happy.'),
    durationMinutes: 2 * HOUR,
    delta: { happiness: 2 },
    words: ['pizza', 'burger', 'fries', 'mac and cheese', 'macaroni', 'ramen', 'noodle', 'lasagna', 'lasagne', 'stew', 'casserole', 'dumpling', 'pasta', 'grilled cheese', 'nachos', 'pot pie', 'shepherd', 'chowder', 'mashed', 'risotto'],
    es: ['pizza', 'hamburguesa', 'papas fritas', 'patatas fritas', 'macarrones', 'ramen', 'fideos', 'lasaña', 'estofado', 'guiso', 'pasta', 'nachos', 'puré', 'risotto', 'cazuela'],
    zh: ['披萨', '比萨', '汉堡', '薯条', '通心粉', '拉面', '面条', '千层面', '炖', '饺子', '意面', '意大利面', '烩饭', '砂锅', '馄饨', '粥', '米线'],
  },
  {
    id: 'feast',
    label: msg('Stuffed'),
    reaction: t('Ugh. Too much.'),
    durationMinutes: 2 * HOUR,
    // A food coma: a little slower, a little content.
    delta: { charge: -2, happiness: 1 },
    test: (meal) => (meal.analysis?.macros.calories ?? 0) >= 900,
  },
  {
    id: 'brain_food',
    label: msg('Sharp'),
    reaction: t('Thinking clearly.'),
    durationMinutes: 3 * HOUR,
    delta: { mind: 2 },
    words: ['salmon', 'tuna', 'sardine', 'mackerel', 'trout', 'fish', 'walnut', 'almond', 'egg', 'eggs', 'avocado', 'blueberr', 'oats', 'oatmeal', 'seeds', 'nuts'],
    es: ['salmón', 'atún', 'sardina', 'caballa', 'trucha', 'pescado', 'nuez', 'nueces', 'almendra', 'huevo', 'aguacate', 'palta', 'avena', 'semillas', 'frutos secos'],
    zh: ['三文鱼', '金枪鱼', '沙丁鱼', '鲭鱼', '鳟鱼', '鱼片', '鱼肉', '烤鱼', '蒸鱼', '鱼排', '核桃', '杏仁', '鸡蛋', '煎蛋', '炒蛋', '水煮蛋', '牛油果', '蓝莓', '燕麦', '坚果'],
  },
  {
    id: 'carb_loaded',
    label: msg('Fuelled'),
    reaction: t('Ready to run.'),
    durationMinutes: 3 * HOUR,
    delta: { endurance: 1 },
    test: (meal) => (meal.analysis?.macros.carbsGrams ?? 0) >= 80,
  },
];

/** Effects that say a plate is good for you. A D plate never wears them. */
const WHOLESOME_EFFECTS: ReadonlySet<FoodEffectId> = new Set(['protein_packed', 'greens', 'fresh', 'brain_food']);

export const FOOD_EFFECT_BY_ID: Record<FoodEffectId, FoodEffect> = Object.fromEntries(
  FOOD_EFFECT_RULES.map(({ words: _w, es: _es, zh: _zh, test: _t, ...effect }) => [effect.id, effect]),
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

/** A whole Spanish word, plural allowed; a letter with an accent is a letter, so "té" is not found in "tés…" or "paté". */
const hasSpanishWord = (text: string, word: string): boolean =>
  new RegExp(`(^|[^a-záéíóúüñ])${escape(word)}(s|es)?($|[^a-záéíóúüñ])`, 'i').test(text);

/**
 * The effects one meal carries, in display order. At most three: past that a
 * plate reads as everything at once, which is the same as nothing.
 */
export const detectFoodEffects = (meal: MealMetadata): FoodEffect[] => {
  const text = mealText(meal);
  const junk = meal.analysis?.grade === 'D';
  const found: FoodEffect[] = [];
  for (const rule of FOOD_EFFECT_RULES) {
    if (junk && WHOLESOME_EFFECTS.has(rule.id)) continue;
    const byWord =
      (rule.words?.some((word) => hasWord(text, word)) ?? false) ||
      (rule.es?.some((word) => hasSpanishWord(text, word)) ?? false) ||
      (rule.zh?.some((word) => text.includes(word)) ?? false);
    const byTest = rule.test?.(meal) ?? false;
    if (byWord || byTest) {
      const { words: _w, es: _es, zh: _zh, test: _t, ...effect } = rule;
      found.push(effect);
    }
  }
  return found.slice(0, 3);
};

export const MAX_ACTIVE_FOOD_EFFECTS = 5;

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
