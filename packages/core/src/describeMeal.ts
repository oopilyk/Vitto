import { getFdcApiKey, getSupabase } from './config';
import { matchParsedItem, parseMealText } from './domain/mealText';
import {
  fatsecretFoodToResult,
  fdcFoodToResult,
  searchFoodsByName,
  servingGrams,
  type FatSecretFood,
  type FoodSearchResult,
  type PortionUnit,
} from './foodDatabase';
import { getLocale, msg, t, translateServerMessage } from './i18n';

/**
 * A meal said in a sentence, as foods for the plate.
 *
 * Read here first, with no model (`parseMealText`): "2 eggs, 150 g chicken
 * breast" is a list of names and amounts, each name is searched as the search
 * box would search it, and when every one has a food of exactly that name the
 * plate is filled at once, for nothing. Whatever that cannot be sure of goes to
 * the `describe-meal` function, where a model reads the sentence and picks the
 * foods from the same databases. Either way the answer is database foods with
 * serving counts, to be checked on the plate before anything is logged.
 */

/** One food of a described meal, ready for the plate. */
export interface DescribedFood {
  food: FoodSearchResult;
  servings: number;
  unit: PortionUnit;
  /** The words it was read from: "2 scrambled eggs". */
  said: string;
}

export interface DescribedMeal {
  items: DescribedFood[];
  /** `parser` cost nothing; `ai` used one of the day's described meals. */
  via: 'parser' | 'ai';
  /** What was said that could be neither found nor estimated. */
  missed: string[];
}

export const MAX_MEAL_TEXT_LENGTH = 300;
const MAX_SERVINGS = 30;

export interface DescribeMealOptions {
  /** The food search to use: the app passes its cached one. */
  search?: (query: string) => Promise<FoodSearchResult[]>;
}

/** The sentence read without a model, or null when any food in it is not certain. */
const describeLocally = async (text: string, search: NonNullable<DescribeMealOptions['search']>): Promise<DescribedFood[] | null> => {
  const parsed = parseMealText(text);
  if (!parsed) return null;
  const matched = await Promise.all(
    parsed.map(async (item) => {
      // A failed search is not an error here: the model gets the sentence instead.
      const results = await search(item.name).catch(() => []);
      const match = matchParsedItem(item, results);
      return match ? { ...match, said: item.name } : null;
    }),
  );
  return matched.every((item): item is DescribedFood => item !== null) ? matched : null;
};

interface ServerEstimate {
  name?: unknown;
  grams?: unknown;
  calories?: unknown;
  proteinGrams?: unknown;
  carbsGrams?: unknown;
  fatGrams?: unknown;
  fiberGrams?: unknown;
}

const amount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** A food no database carried, with the model's own figures, marked as an estimate. */
const estimateToResult = (estimate: ServerEstimate, index: number): FoodSearchResult | null => {
  const name = typeof estimate.name === 'string' ? estimate.name.trim() : '';
  if (!name) return null;
  const grams = Math.round(amount(estimate.grams));
  return {
    id: `estimate-${Date.now().toString(36)}-${index}`,
    name,
    servingDescription: grams > 0 ? `about ${grams} g` : msg('estimated serving'),
    basisGrams: grams > 0 ? grams : undefined,
    isPer100g: false,
    macros: {
      calories: Math.round(amount(estimate.calories)),
      proteinGrams: amount(estimate.proteinGrams),
      carbsGrams: amount(estimate.carbsGrams),
      fatGrams: amount(estimate.fatGrams),
      fiberGrams: amount(estimate.fiberGrams),
    },
    source: 'estimate',
  };
};

/** The server's reply as plate foods. Anything in it that is not what it should be is left out, never guessed at. */
const readServerItems = (raw: unknown): DescribedFood[] => {
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry, index): DescribedFood | null => {
      const { said, source, food: sent, servings, byWeight } = (entry ?? {}) as Record<string, unknown>;
      const food =
        source === 'fatsecret'
          ? fatsecretFoodToResult(sent as FatSecretFood)
          : source === 'usda'
            ? fdcFoodToResult(sent)
            : source === 'estimate'
              ? estimateToResult((sent ?? {}) as ServerEstimate, index)
              : null;
      if (!food) return null;
      const count = Math.min(MAX_SERVINGS, amount(servings) || 1);
      const weighed = servingGrams(food) !== undefined;
      return {
        food,
        servings: count,
        // In grams when that is how it was said or how the food is listed; else as "2 × 1 large".
        unit: weighed && (food.isPer100g || byWeight === true) ? 'g' : 'serving',
        said: typeof said === 'string' && said.trim() ? said.trim() : food.name,
      };
    })
    .filter((item): item is DescribedFood => item !== null);
};

const NOT_FOOD = t('That did not sound like food. Try something like "2 eggs and toast with butter".');
const FAILED = t('Could not read that meal. Try again.');
const OFFLINE = t("Couldn't reach Vitto to read that. Check your connection and try again.");
const UNAVAILABLE = t('Vitto could not read that just now. Try again in a moment, or add your foods with Search.');

/**
 * Whether a request that never got an answer failed for want of a connection.
 * A browser reports a server-side failure the same way (the reply is withheld
 * from the page), and blaming the connection then sends people to fix what is
 * not broken: it knows whether it is online, so it is asked. A phone does not
 * say, and there a request with no answer is the connection.
 */
const isOffline = (): boolean => (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== true;

/** The reason a function refused, from the reply it sent with its error status. */
const refusal = async (error: unknown): Promise<string | null> => {
  // Duck-typed, not `instanceof Response`: React Native's fetch has its own Response class.
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof (context as Response).text !== 'function') return null;
  try {
    const reason = (JSON.parse(await (context as Response).text()) as { error?: unknown }).error;
    return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
  } catch {
    return null;
  }
};

/**
 * Reads a described meal. Throws with a sentence fit to show when it cannot:
 * nothing typed, not food, the day's allowance used, no connection.
 */
export const describeMeal = async (text: string, { search = searchFoodsByName }: DescribeMealOptions = {}): Promise<DescribedMeal> => {
  const said = text.replace(/\s+/g, ' ').trim().slice(0, MAX_MEAL_TEXT_LENGTH);
  if (!said) throw new Error(t('Say or type what you ate.'));

  const local = await describeLocally(said, search);
  if (local) return { items: local, via: 'parser', missed: [] };

  const supabase = getSupabase();
  // No server (the app's local mode): only what can be read without one.
  if (!supabase) throw new Error(t('List each food with an amount, like "2 eggs, 150 g rice".'));

  const { data, error } = await supabase.functions.invoke('describe-meal', { body: { text: said, key: getFdcApiKey(), locale: getLocale() } });
  if (error) {
    if ((error as { name?: string }).name === 'FunctionsFetchError') throw new Error(isOffline() ? OFFLINE : UNAVAILABLE);
    const reason = await refusal(error);
    throw new Error(reason ? translateServerMessage(reason) : FAILED);
  }
  if ((data as { notFood?: unknown } | null)?.notFood) throw new Error(NOT_FOOD);
  const items = readServerItems(data);
  if (items.length === 0) throw new Error(FAILED);
  const missed = (data as { missed?: unknown }).missed;
  return { items, via: 'ai', missed: Array.isArray(missed) ? missed.filter((entry): entry is string => typeof entry === 'string') : [] };
};
