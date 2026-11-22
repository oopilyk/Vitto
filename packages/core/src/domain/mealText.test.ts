import { describe, expect, it } from 'vitest';
import type { FoodSearchResult } from '../foodDatabase';
import { matchParsedItem, parseMealText } from './mealText';

const macros = { calories: 100, proteinGrams: 5, carbsGrams: 10, fatGrams: 2, fiberGrams: 1 };
const food = (name: string, servingDescription: string, extra: Partial<FoodSearchResult> = {}): FoodSearchResult => ({
  id: name,
  name,
  servingDescription,
  macros,
  ...extra,
});

describe('parseMealText', () => {
  it('reads plain foods with plain amounts', () => {
    expect(parseMealText('2 eggs, 150g chicken breast and a banana')).toEqual([
      { name: 'eggs', amount: 2, unit: 'count', explicit: true },
      { name: 'chicken breast', amount: 150, unit: 'g', explicit: true },
      { name: 'banana', amount: 1, unit: 'count', explicit: true },
    ]);
  });

  it('reads units, fractions, number words and unit conversions', () => {
    expect(parseMealText('1 1/2 cups of rice; two slices bread + half an avocado')).toEqual([
      { name: 'rice', amount: 1.5, unit: 'cup', explicit: true },
      { name: 'bread', amount: 2, unit: 'slice', explicit: true },
      { name: 'avocado', amount: 0.5, unit: 'count', explicit: true },
    ]);
    expect(parseMealText('1 lb ground beef')).toEqual([{ name: 'ground beef', amount: 16, unit: 'oz', explicit: true }]);
    expect(parseMealText('0.2 kg salmon')).toEqual([{ name: 'salmon', amount: 200, unit: 'g', explicit: true }]);
  });

  it('drops how a spoken sentence starts and ends', () => {
    expect(parseMealText('For breakfast I had 3 eggs and oatmeal.')).toEqual([
      { name: 'eggs', amount: 3, unit: 'count', explicit: true },
      { name: 'oatmeal', amount: 1, unit: 'count', explicit: false },
    ]);
    expect(parseMealText('I just ate an apple for lunch')).toEqual([{ name: 'apple', amount: 1, unit: 'count', explicit: true }]);
  });

  it('keeps a food with "and" in its name whole', () => {
    expect(parseMealText('mac and cheese and 2 cookies')).toEqual([
      { name: 'mac and cheese', amount: 1, unit: 'count', explicit: false },
      { name: 'cookies', amount: 2, unit: 'count', explicit: true },
    ]);
    // "and" inside a word is not a join.
    expect(parseMealText('a sandwich')).toEqual([{ name: 'sandwich', amount: 1, unit: 'count', explicit: true }]);
  });

  it('does not mistake the start of a word for an amount or a unit', () => {
    expect(parseMealText('an apple')?.[0]?.name).toBe('apple');
    expect(parseMealText('2 grapes')).toEqual([{ name: 'grapes', amount: 2, unit: 'count', explicit: true }]);
  });

  it.each([
    'a big bowl of chicken curry',
    'toast with butter',
    'a handful of almonds',
    'my usual chipotle bowl',
    'a large latte',
    'a glass of milk',
    'leftover pizza',
    'some rice',
    '2% milk',
    '200 chicken',
    '',
    '   ',
  ])('leaves "%s" to the model', (text) => {
    expect(parseMealText(text)).toBeNull();
  });

  it('leaves a long list to the model', () => {
    expect(parseMealText('egg, rice, beans, kale, tofu, salmon, apple, pear, plum')).toBeNull();
  });
});

describe('matchParsedItem', () => {
  const eggs = [food('Egg Whites', '1 large'), food('Egg', '1 large (50 g)'), food('Egg, whole, raw', 'per 100 g', { isPer100g: true })];

  it('counts in a serving that is one of the thing', () => {
    const match = matchParsedItem({ name: 'eggs', amount: 2, unit: 'count', explicit: true }, eggs);
    expect(match).toMatchObject({ servings: 2, unit: 'serving' });
    expect(match?.food.name).toBe('Egg');
  });

  it('turns a weight into servings by the food\'s own weight', () => {
    const chicken = [food('Chicken Breast', '1/2 small (84 g)')];
    expect(matchParsedItem({ name: 'chicken breast', amount: 168, unit: 'g', explicit: true }, chicken)).toMatchObject({ servings: 2, unit: 'g' });
    const rice = [food('White Rice', 'per 100 g', { isPer100g: true, basisGrams: 100 })];
    expect(matchParsedItem({ name: 'white rice', amount: 250, unit: 'g', explicit: true }, rice)).toMatchObject({ servings: 2.5, unit: 'g' });
    expect(matchParsedItem({ name: 'white rice', amount: 4, unit: 'oz', explicit: true }, rice)?.servings).toBeCloseTo(1.134, 3);
  });

  it('counts cups against a serving given in cups', () => {
    const rice = [food('White Rice', '1/2 cup cooked (79 g)')];
    expect(matchParsedItem({ name: 'white rice', amount: 1.5, unit: 'cup', explicit: true }, rice)).toMatchObject({ servings: 3, unit: 'serving' });
    expect(matchParsedItem({ name: 'white rice', amount: 2, unit: 'tbsp', explicit: true }, rice)).toBeNull();
  });

  it('takes one serving when no amount was said', () => {
    const oats = [food('Oatmeal', '1 cup cooked (234 g)')];
    expect(matchParsedItem({ name: 'oatmeal', amount: 1, unit: 'count', explicit: false }, oats)).toMatchObject({ servings: 1, unit: 'serving' });
  });

  it('says no rather than guess', () => {
    // No food of exactly that name: choosing a variation is a judgment.
    expect(matchParsedItem({ name: 'egg', amount: 1, unit: 'count', explicit: true }, [food('Egg, whole, raw', 'per 100 g', { isPer100g: true })])).toBeNull();
    // A brand's food is not the plain one.
    expect(matchParsedItem({ name: 'egg', amount: 1, unit: 'count', explicit: true }, [food('Egg', '1 large', { brand: 'Acme' })])).toBeNull();
    // Two of a food listed per 100 g, or by the cup, is not two servings.
    expect(matchParsedItem({ name: 'white rice', amount: 2, unit: 'count', explicit: true }, [food('White Rice', '1 cup (158 g)')])).toBeNull();
    expect(matchParsedItem({ name: 'white rice', amount: 2, unit: 'count', explicit: true }, [food('White Rice', 'per 100 g', { isPer100g: true })])).toBeNull();
    // A weight against a food with no weight.
    expect(matchParsedItem({ name: 'egg', amount: 100, unit: 'g', explicit: true }, [food('Egg', '1 large')])).toBeNull();
    // Too far down the results.
    const buried = [...Array.from({ length: 6 }, (_, index) => food(`Egg dish ${index}`, '1 serving')), food('Egg', '1 large')];
    expect(matchParsedItem({ name: 'egg', amount: 1, unit: 'count', explicit: true }, buried)).toBeNull();
  });
});
