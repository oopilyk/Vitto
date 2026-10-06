import { sessionFromLink } from '../services/authLinks';

describe('sign-in links from the confirmation email', () => {
  it('reads the session out of a vitto:// callback', () => {
    expect(sessionFromLink('vitto://auth-callback#access_token=abc&refresh_token=def&type=signup')).toEqual({
      accessToken: 'abc',
      refreshToken: 'def',
    });
  });

  it('ignores anything that is not our callback, or is missing a token', () => {
    expect(sessionFromLink('https://evil.example/auth-callback#access_token=abc&refresh_token=def')).toBeNull();
    expect(sessionFromLink('vitto://somewhere-else#access_token=abc&refresh_token=def')).toBeNull();
    expect(sessionFromLink('vitto://auth-callback#access_token=abc')).toBeNull();
    expect(sessionFromLink('vitto://auth-callback')).toBeNull();
    expect(sessionFromLink('vitto://auth-callback#error=access_denied&error_description=Email+link+is+invalid')).toBeNull();
  });
});
