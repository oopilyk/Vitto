import { describe, expect, it } from 'vitest';
import { convertHeightToFeetAndInches, convertWeightValue, feetAndInchesToCm } from './macroTargets';

describe('unit conversion helpers', () => {
  it('preserves the same value when converting between kg and lb', () => {
    const pounds = convertWeightValue(10, 'kg', 'lb');
    expect(pounds).toBeCloseTo(22.0462, 4);
    expect(convertWeightValue(pounds, 'lb', 'kg')).toBeCloseTo(10, 4);
  });

  it('preserves the same height when converting between cm and ft/in', () => {
    const feetAndInches = convertHeightToFeetAndInches(170);
    expect(feetAndInches).toEqual({ feet: 5, inches: 7 });
    expect(feetAndInchesToCm(feetAndInches.feet, feetAndInches.inches)).toBe(170);
  });
});
