import { describe, expect, it } from 'vitest';
import { NETWORK_ERROR_MESSAGE, SESSION_ERROR_MESSAGE, errorMessage, isNetworkError, isStaleSessionError } from './errorMessage';

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

describe('a token the database will not take', () => {
  // The real one, as PostgREST sends it when the auth server's clock is a second
  // ahead of the database's. A user must never be shown "PGRST303".
  const issuedAtFuture = { code: 'PGRST303', message: 'JWT issued at future', details: null, hint: null };

  it('never leaks the code, whatever shape the error arrives in', () => {
    expect(errorMessage(issuedAtFuture, 'x')).toBe(SESSION_ERROR_MESSAGE);
    expect(errorMessage(issuedAtFuture, 'x')).not.toMatch(/PGRST|jwt/i);
    // postgrest-js returns a real Error subclass in some versions and a plain
    // object in others; both have to be caught, and the Error branch would
    // otherwise win and print the raw message.
    const asError = Object.assign(new Error('JWT issued at future'), { code: 'PGRST303' });
    expect(errorMessage(asError, 'x')).toBe(SESSION_ERROR_MESSAGE);
  });

  it('covers the rest of the family', () => {
    for (const code of ['PGRST301', 'PGRST302', 'PGRST303']) {
      expect(isStaleSessionError({ code, message: 'nope' })).toBe(true);
    }
    expect(isStaleSessionError({ message: 'JWT expired' })).toBe(true);
    expect(isStaleSessionError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isStaleSessionError(new Error('Row not found'))).toBe(false);
  });

  it('still reports errors that are genuinely worth reading', () => {
    expect(errorMessage({ message: 'duplicate key', code: '23505' }, 'x')).toBe('duplicate key (23505)');
  });
});
