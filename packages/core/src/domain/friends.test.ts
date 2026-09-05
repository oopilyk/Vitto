import { describe, expect, it } from 'vitest';
import { isValidUsername, USERNAME_PATTERN } from './friends';

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
