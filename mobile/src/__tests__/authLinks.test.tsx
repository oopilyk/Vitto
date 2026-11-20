import { sessionFromLink, signInFromLink } from '../services/authLinks';

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
    // A password-reset link never signs in: that would skip setting the new password.
    expect(sessionFromLink('vitto://auth-callback#access_token=abc&refresh_token=def&type=recovery')).toBeNull();
  });

  const LINK = 'vitto://auth-callback#access_token=abc&refresh_token=def&type=signup';
  const authWith = (session: unknown) => ({
    getSession: jest.fn(async () => ({ data: { session } })),
    setSession: jest.fn(async () => ({})),
  });

  it('signs a signed-out app in from the link', async () => {
    const auth = authWith(null);
    await signInFromLink(LINK, auth);
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'abc', refresh_token: 'def' });
  });

  it('never swaps the account of someone already signed in', async () => {
    const auth = authWith({ user: { id: 'me' } });
    await signInFromLink(LINK, auth);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('leaves the app alone for a link that is not ours, or when the check fails', async () => {
    const auth = authWith(null);
    await signInFromLink('https://evil.example/auth-callback#access_token=abc&refresh_token=def', auth);
    expect(auth.getSession).not.toHaveBeenCalled();
    const broken = { getSession: jest.fn(async () => { throw new Error('offline'); }), setSession: jest.fn() };
    await expect(signInFromLink(LINK, broken)).resolves.toBeUndefined();
    expect(broken.setSession).not.toHaveBeenCalled();
  });
});
