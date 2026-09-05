import { FriendsService, mapSetUsernameError, validateUsernameInput } from '../services/friendsService';

describe('validateUsernameInput', () => {
  it('lower-cases and trims a valid username', () => {
    expect(validateUsernameInput('  Owen_Akers10  ')).toBe('owen_akers10');
  });

  it('rejects a username that is too short', () => {
    expect(() => validateUsernameInput('ab')).toThrow(
      'Usernames are 3-20 characters: lowercase letters, digits, and underscores only.',
    );
  });

  it('rejects a username with invalid characters even before lower-casing', () => {
    expect(() => validateUsernameInput('owen akers')).toThrow();
    expect(() => validateUsernameInput('owen-akers')).toThrow();
  });

  it('accepts a username that is only valid after lower-casing', () => {
    // Uppercase letters are stripped to lowercase first, so this must pass.
    expect(validateUsernameInput('OWEN')).toBe('owen');
  });
});

describe('mapSetUsernameError', () => {
  it('maps a unique-constraint violation to a friendly message', () => {
    expect(mapSetUsernameError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'That username is taken.',
    );
  });

  it('falls back to the Supabase error message for anything else', () => {
    expect(mapSetUsernameError({ code: '42501', message: 'permission denied' })).toContain('permission denied');
  });

  it('falls back to a generic message when there is nothing else to show', () => {
    expect(mapSetUsernameError(null)).toBe('Could not save your username.');
  });
});

describe('FriendsService.searchUsersByUsername', () => {
  const service = new FriendsService();

  it('returns no results for a query under two characters, without touching Supabase', async () => {
    // No Supabase client is configured in this test environment at all -- if this
    // ever tried to reach the network it would throw synchronously via
    // `requireSupabase()`, so resolving cleanly proves the short-circuit runs first.
    await expect(service.searchUsersByUsername('a')).resolves.toEqual([]);
    await expect(service.searchUsersByUsername('')).resolves.toEqual([]);
    await expect(service.searchUsersByUsername('  a  ')).resolves.toEqual([]);
  });
});
