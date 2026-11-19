import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FoodSearchResult } from '@vitto/core';

/**
 * Suggestions as you type, the way a search box with history does it: every
 * keystroke shows what is already known that matches, at once, while the food
 * database is asked in the background. Searches are rate limited (60 an hour
 * per account), so the database cannot be asked on every letter, but the
 * foods it has already answered with, and the ones put on a plate before, can
 * be filtered locally for free.
 */

/** Everything the database answered this session, by term. Shared across visits to the logger. */
const answered = new Map<string, FoodSearchResult[]>();

const RECENT_KEY = 'vitto.foods.recent';
const MAX_RECENT = 60;
let recent: FoodSearchResult[] = [];
let recentLoaded: Promise<void> | null = null;

/** The foods put on a plate before, newest first: read once per app run. */
export const loadRecentFoods = (): Promise<void> => {
  recentLoaded ??= AsyncStorage.getItem(RECENT_KEY)
    .then((value) => {
      const parsed = value ? (JSON.parse(value) as unknown) : [];
      recent = Array.isArray(parsed) ? (parsed as FoodSearchResult[]).filter((food) => food?.id && food?.name && food?.macros) : [];
    })
    .catch(() => undefined);
  return recentLoaded;
};

/** A food put on a plate: first in its suggestions from now on. */
export const rememberFood = (food: FoodSearchResult): void => {
  recent = [food, ...recent.filter((candidate) => candidate.id !== food.id)].slice(0, MAX_RECENT);
  void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(recent)).catch(() => undefined);
};

export const cachedSearch = (term: string): FoodSearchResult[] | undefined => answered.get(term.trim().toLowerCase());
export const cacheSearch = (term: string, results: FoodSearchResult[]): void => {
  answered.set(term.trim().toLowerCase(), results);
};

/**
 * What is known that matches `term`: every word of it at the start of a word
 * in the name ("chi bre" finds Chicken Breast). Foods put on a plate before
 * lead, then names that start with the term, then the rest.
 */
export const localSuggestions = (term: string, limit = 12): FoodSearchResult[] => {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches = (food: FoodSearchResult) => {
    const nameWords = food.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)));
  };
  const seen = new Set<string>();
  const ranked: { food: FoodSearchResult; rank: number; order: number }[] = [];
  const consider = (food: FoodSearchResult, fromRecent: boolean) => {
    if (seen.has(food.id) || !matches(food)) return;
    seen.add(food.id);
    const startsWith = food.name.toLowerCase().startsWith(words[0]!);
    ranked.push({ food, rank: fromRecent ? 0 : startsWith ? 1 : 2, order: ranked.length });
  };
  recent.forEach((food) => consider(food, true));
  for (const list of answered.values()) list.forEach((food) => consider(food, false));
  return ranked
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map(({ food }) => food);
};

/** Tests start from nothing. */
export const resetFoodSuggestions = (): void => {
  answered.clear();
  recent = [];
  recentLoaded = null;
};
