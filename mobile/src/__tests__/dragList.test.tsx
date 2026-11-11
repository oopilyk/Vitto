import { dragTarget } from '../components/DragList';

describe('dragTarget', () => {
  // Three rows: 80, 60 (a rest day) and 80 tall, gap included.
  const heights = [80, 60, 80];

  it('passes a neighbour once over its middle, and no further than the ends', () => {
    expect(dragTarget(heights, 0, 29)).toBe(0);
    expect(dragTarget(heights, 0, 31)).toBe(1);
    expect(dragTarget(heights, 0, 60 + 41)).toBe(2);
    expect(dragTarget(heights, 0, 1000)).toBe(2);
    expect(dragTarget(heights, 2, -31)).toBe(1);
    expect(dragTarget(heights, 2, -1000)).toBe(0);
  });
});
