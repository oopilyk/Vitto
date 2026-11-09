import { describe, expect, it } from 'vitest';
import { initialOf } from './initials';

describe('initialOf', () => {
  it('takes a whole emoji, not half of one', () => {
    expect(initialOf('🐶 Kyle')).toBe('🐶');
  });
  it('upper-cases a letter and falls back when there is nothing', () => {
    expect(initialOf(' kyle')).toBe('K');
    expect(initialOf('')).toBe('?');
    expect(initialOf(undefined, 'V')).toBe('V');
  });
});
