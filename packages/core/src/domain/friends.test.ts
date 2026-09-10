import { describe, expect, it } from 'vitest';
import { isValidUsername, normalizeUsername, usernameError, USERNAME_PATTERN } from './friends';

describe('isValidUsername', () => {
  it('accepts lowercase letters, digits, and underscores between 3 and 20 characters', () => {
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('owen_akers10')).toBe(true);
    expect(isValidUsername('a'.repeat(20))).toBe(true);
  });

  it('rejects usernames shorter than 3 characters', () => {
    expect(isValidUsername('ab')).toBe(false);
  });

  it('rejects usernames longer than 20 characters', () => {
    expect(isValidUsername('a'.repeat(21))).toBe(false);
  });

  it('rejects uppercase letters', () => {
    expect(isValidUsername('Owen123')).toBe(false);
  });

  it('rejects characters outside letters, digits, and underscore', () => {
    expect(isValidUsername('owen-akers')).toBe(false);
    expect(isValidUsername('owen akers')).toBe(false);
    expect(isValidUsername('owen@akers')).toBe(false);
  });

  it('matches USERNAME_PATTERN directly', () => {
    expect(USERNAME_PATTERN.test('vitto_user')).toBe(true);
  });
});


describe('normalizeUsername', () => {
  it('is what actually gets stored: trimmed and lower-cased', () => {
    expect(normalizeUsername('  Kyle_Li  ')).toBe('kyle_li');
  });

  it('collapses case so one name cannot be claimed twice', () => {
    // The unique index sees one canonical form, so "Kyle_Li" and "kyle_li"
    // cannot both exist.
    expect(normalizeUsername('KYLE_LI')).toBe(normalizeUsername('kyle_li'));
  });
});

describe('usernameError', () => {
  it('accepts a well-formed name, in any case the user types it', () => {
    expect(usernameError('kyle_li')).toBeNull();
    expect(usernameError('Kyle_Li')).toBeNull();
    expect(usernameError('  kyle_li ')).toBeNull();
  });

  it('asks for one when the field is empty', () => {
    expect(usernameError('')).toMatch(/pick a username/i);
    expect(usernameError('   ')).toMatch(/pick a username/i);
  });

  it('names the length problem rather than a generic rejection', () => {
    expect(usernameError('ab')).toMatch(/at least 3/i);
    expect(usernameError('a'.repeat(21))).toMatch(/at most 20/i);
  });

  it('names the character problem for an otherwise well-sized username', () => {
    expect(usernameError('kyle-li')).toMatch(/lowercase letters, digits and underscores/i);
    expect(usernameError('kyle li')).toMatch(/lowercase letters, digits and underscores/i);
  });

  it('agrees with isValidUsername on the normalized form', () => {
    for (const candidate of ['kyle_li', 'ab', 'a'.repeat(21), 'kyle-li', 'Kyle_Li', 'x9_']) {
      expect(usernameError(candidate) === null).toBe(isValidUsername(normalizeUsername(candidate)));
    }
  });
});
