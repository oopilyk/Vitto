import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { foodSuggestions, loggedFoodNames } from './foodSuggestions';

describe('foodSuggestions', () => {
  it('completes a word anywhere in the name, from two letters', () => {
    expect(foodSuggestions('sour')).toEqual(['Sour cream', 'Sourdough bread']);
    expect(foodSuggestions('cream')).toContain('Sour cream');
    expect(foodSuggestions('s')).toEqual([]);
  });

  it('puts the foods someone has logged first, once each', () => {
    expect(foodSuggestions('sour', ['Sour Patch Kids', 'sour cream'])).toEqual(['Sour Patch Kids', 'sour cream', 'Sourdough bread']);
  });
});

describe('loggedFoodNames', () => {
  it('reads the foods off meals, newest first', () => {
    const meal = (id: string, at: string, foods: string[]): HealthEvent => ({
      id, userId: 'u', type: 'MEAL', source: 'manual', occurredAt: at,
      metadata: { analysis: { detectedFoods: foods } } as never,
    });
    expect(loggedFoodNames([meal('1', '2026-11-01T08:00:00Z', ['Oats', 'Banana']), meal('2', '2026-11-02T08:00:00Z', ['Banana', 'Eggs'])]))
      .toEqual(['Banana', 'Eggs', 'Oats']);
  });
});
