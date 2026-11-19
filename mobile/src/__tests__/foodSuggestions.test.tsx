import type { FoodSearchResult } from '@vitto/core';
import { cacheSearch, localSuggestions, rememberFood, resetFoodSuggestions } from '../services/foodSuggestions';

const food = (id: string, name: string): FoodSearchResult =>
  ({ id, name, servingDescription: 'per 100 g', isPer100g: true, macros: { calories: 100, proteinGrams: 1, carbsGrams: 1, fatGrams: 1, fiberGrams: 0 } }) as FoodSearchResult;

describe('food suggestions as you type', () => {
  beforeEach(() => resetFoodSuggestions());

  it('matches the start of each word, from one letter on, from answers already had', () => {
    cacheSearch('rice', [food('r', 'White Rice, cooked'), food('b', 'Brown Rice')]);
    cacheSearch('chicken', [food('c', 'Chicken Breast')]);
    expect(localSuggestions('ri').map((f) => f.id)).toEqual(['r', 'b']);
    expect(localSuggestions('chi bre').map((f) => f.id)).toEqual(['c']);
    expect(localSuggestions('ice')).toEqual([]);
  });

  it('puts foods they have eaten before first', () => {
    cacheSearch('rice', [food('r', 'White Rice, cooked'), food('b', 'Brown Rice')]);
    rememberFood(food('b', 'Brown Rice'));
    expect(localSuggestions('r').map((f) => f.id)).toEqual(['b', 'r']);
  });
});
