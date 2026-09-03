import { describe, expect, it } from 'vitest';
import { NoFoodDetectedError, parseMealAnalysisResponse } from './mealAnalysis';

const validAnalysis = {
  noFoodDetected: false,
  foodDescription: '120g grilled salmon, 90g rice',
  grade: 'A',
  summary: 'Lean protein with a starch.',
  confidence: 0.8,
  detectedFoods: ['grilled salmon', 'white rice'],
  macros: { calories: 430, proteinGrams: 35, carbsGrams: 40, fatGrams: 12 },
  nutrients: { protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false },
};

describe('parseMealAnalysisResponse', () => {
  it('normalises a valid analysis payload', () => {
    const analysis = parseMealAnalysisResponse({ analysis: validAnalysis });

    expect(analysis.grade).toBe('A');
    expect(analysis.detectedFoods).toEqual(['grilled salmon', 'white rice']);
    expect(analysis.macros.calories).toBe(430);
  });

  it('derives calories from macros when the model omits them', () => {
    const analysis = parseMealAnalysisResponse({
      analysis: { ...validAnalysis, macros: { ...validAnalysis.macros, calories: 0 } },
    });

    expect(analysis.macros.calories).toBe(35 * 4 + 40 * 4 + 12 * 9);
  });

  it('throws NoFoodDetectedError when the function returns the no-food result', () => {
    expect(() => parseMealAnalysisResponse({ noFoodDetected: true })).toThrow(NoFoodDetectedError);
  });

  it('throws NoFoodDetectedError when the analysis flags no food', () => {
    expect(() =>
      parseMealAnalysisResponse({
        analysis: {
          ...validAnalysis,
          noFoodDetected: true,
          detectedFoods: [],
          macros: { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
        },
      }),
    ).toThrow(NoFoodDetectedError);
  });

  it('treats an empty analysis with no foods and no macros as no food', () => {
    expect(() =>
      parseMealAnalysisResponse({
        analysis: {
          grade: 'D',
          summary: '',
          confidence: 0,
          detectedFoods: [],
          macros: { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
          nutrients: {},
        },
      }),
    ).toThrow(NoFoodDetectedError);
  });

  it('carries a friendly, user-facing message on the error', () => {
    try {
      parseMealAnalysisResponse({ noFoodDetected: true });
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NoFoodDetectedError);
      expect((error as NoFoodDetectedError).message).toMatch(/couldn't find a meal/i);
    }
  });

  it('rejects a non-object payload', () => {
    expect(() => parseMealAnalysisResponse(null)).toThrow(/Meal analysis failed/i);
  });

  it('defaults an unknown grade to C rather than failing', () => {
    const analysis = parseMealAnalysisResponse({
      analysis: { ...validAnalysis, grade: 'F' },
    });

    expect(analysis.grade).toBe('C');
  });
});
