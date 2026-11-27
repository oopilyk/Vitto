import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { mealFixUserText, mealUserText, readCorrection, readMealLanguage } from './mealPrompt.ts';

Deno.test('a correction keeps what the re-estimate needs, bounded', () => {
  const fix = readCorrection({
    text: '  strawberry matcha with almond milk  ',
    previous: {
      foodDescription: '1 iced matcha latte (~470ml / 16oz)',
      detectedFoods: ['iced matcha latte', 42],
      macros: { calories: 190.4, proteinGrams: 8, carbsGrams: 26, fatGrams: 6, sneaky: 'x' },
      grade: 'C',
    },
  });
  assertEquals(fix, {
    text: 'strawberry matcha with almond milk',
    previous: {
      foodDescription: '1 iced matcha latte (~470ml / 16oz)',
      detectedFoods: ['iced matcha latte'],
      calories: 190,
      proteinGrams: 8,
      carbsGrams: 26,
      fatGrams: 6,
    },
  });
  assertEquals(readCorrection({ text: 'x'.repeat(1000), previous: {} })!.text.length, 300);
});

Deno.test('no words, no correction', () => {
  assertEquals(readCorrection(undefined), null);
  assertEquals(readCorrection({ text: '   ' }), null);
  assertEquals(readCorrection('strawberry'), null);
});

Deno.test('the model is told the earlier estimate and the correction', () => {
  const text = mealFixUserText(readCorrection({ text: 'strawberry matcha', previous: { foodDescription: 'iced matcha latte (~470ml)', macros: { calories: 190 } } })!, null);
  assertStringIncludes(text, 'Earlier estimate: iced matcha latte (~470ml) (190 kcal');
  assertStringIncludes(text, 'actually: "strawberry matcha"');
});

Deno.test('the words the person reads are asked for in the app language, and English is unchanged', () => {
  const english = mealUserText(null);
  assertEquals(mealUserText(null, readMealLanguage('en')), english);
  assertEquals(mealUserText(null, readMealLanguage('Klingon')), english);
  assertStringIncludes(mealUserText(null, readMealLanguage('es')), 'Spanish');
  assertStringIncludes(mealUserText(null, readMealLanguage('zh-Hans')), 'Simplified Chinese');
  const fix = readCorrection({ text: 'té matcha', previous: { foodDescription: 'iced matcha latte', macros: { calories: 190 } } })!;
  assertStringIncludes(mealFixUserText(fix, null, 'es'), 'Spanish');
});
