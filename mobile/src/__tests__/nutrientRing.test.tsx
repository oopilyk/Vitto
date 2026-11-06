import { ringValueSize } from '../components/NutrientRing';

describe('nutrient ring number', () => {
  it('keeps short numbers full size and steps long ones down to fit the hole', () => {
    expect(ringValueSize('100', 84)).toBe(22);
    expect(ringValueSize('2,420', 84)).toBeLessThan(22);
    expect(ringValueSize('12,345', 84)).toBeLessThan(ringValueSize('2,420', 84));
    // Whatever it picks fits: the text's estimated width is inside the ring's hole.
    for (const text of ['2,420', '12,345', '999,999']) {
      const width = [...text].reduce((sum, char) => sum + (char === ',' ? 0.3 : 0.62), 0) * ringValueSize(text, 84);
      expect(width).toBeLessThanOrEqual(84 * 0.75);
    }
  });
});
