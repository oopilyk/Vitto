import { describe, expect, it } from 'vitest';
import { NETWORK_ERROR_MESSAGE, errorMessage, isNetworkError } from './errorMessage';

describe('errorMessage', () => {
  it('passes a real message through', () => {
    expect(errorMessage(new Error('Saving timed out.'), 'x')).toBe('Saving timed out.');
  });

  it('joins a PostgREST error with its code', () => {
    expect(errorMessage({ message: 'duplicate key', code: '23505' }, 'x')).toBe('duplicate key (23505)');
  });

  it('falls back when there is nothing usable', () => {
    expect(errorMessage(undefined, 'Could not save.')).toBe('Could not save.');
    expect(errorMessage({}, 'Could not save.')).toBe('Could not save.');
  });

  it('never shows a raw transport failure — the browser, RN and Safari wordings alike', () => {
    for (const raw of ['Failed to fetch', 'Network request failed', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      expect(isNetworkError(new TypeError(raw))).toBe(true);
      expect(errorMessage(new TypeError(raw), 'x')).toBe(NETWORK_ERROR_MESSAGE);
    }
    expect(errorMessage({ message: 'Failed to fetch' }, 'x')).toBe(NETWORK_ERROR_MESSAGE);
    expect(isNetworkError(new Error('Row not found'))).toBe(false);
  });
});
