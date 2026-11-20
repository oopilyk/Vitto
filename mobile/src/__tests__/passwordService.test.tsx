import { changePassword, resetPasswordWithCode, type PasswordDeps } from '../services/passwordService';

type Mock = jest.Mock;
const ok = (data: unknown = {}) => ({ data, error: null });
const fail = (code: string, message: string) => ({ data: {}, error: Object.assign(new Error(message), { code }) });

/** A stand-in for one auth client, recording every call in order. */
const fakeAuth = (calls: string[], name: string, signedIn = false) => ({
  getSession: jest.fn(async () => ok({ session: signedIn ? { user: { id: 'u' } } : null })),
  verifyOtp: jest.fn(async () => {
    calls.push(`${name}.verifyOtp`);
    return ok({ session: {} });
  }),
  signInWithPassword: jest.fn(async ({ password }: { password: string }) => {
    calls.push(`${name}.signIn(${password})`);
    return ok({ session: {} });
  }),
  updateUser: jest.fn(async ({ password }: { password: string }) => {
    calls.push(`${name}.updateUser(${password})`);
    return ok({ user: {} });
  }),
  signOut: jest.fn(async ({ scope }: { scope: string }) => {
    calls.push(`${name}.signOut(${scope})`);
    return { error: null };
  }),
});

const setup = (signedIn: boolean) => {
  const calls: string[] = [];
  const app = fakeAuth(calls, 'app', signedIn);
  const side = fakeAuth(calls, 'side');
  const deps = { appAuth: app, makeSideAuth: () => side } as unknown as PasswordDeps;
  return { calls, app, side, deps };
};

describe('forgot password', () => {
  it('signed out: proves the code on the side, sets the password, signs everyone else out, then signs in', async () => {
    const { calls, side, deps } = setup(false);
    await resetPasswordWithCode(' sam@example.com ', '123 456', 'newpass99', deps);
    expect((side.verifyOtp as Mock).mock.calls[0][0]).toEqual({ email: 'sam@example.com', token: '123456', type: 'recovery' });
    expect(calls).toEqual([
      'side.verifyOtp',
      'side.updateUser(newpass99)',
      'side.signOut(others)',
      'side.signOut(local)',
      'app.signIn(newpass99)',
    ]);
  });

  it('a wrong code changes nothing and signs nobody in', async () => {
    const { calls, side, deps } = setup(false);
    (side.verifyOtp as Mock).mockResolvedValueOnce(fail('otp_expired', 'Token has expired or is invalid'));
    await expect(resetPasswordWithCode('sam@example.com', '000000', 'newpass99', deps)).rejects.toMatchObject({ code: 'otp_expired' });
    expect(calls).toEqual([]);
  });

  it('a refused new password leaves the app signed out, and the side session forgotten', async () => {
    const { calls, side, deps } = setup(false);
    (side.updateUser as Mock).mockResolvedValueOnce(fail('same_password', 'New password should be different from the old password.'));
    await expect(resetPasswordWithCode('sam@example.com', '123456', 'oldpass99', deps)).rejects.toMatchObject({ code: 'same_password' });
    expect(calls).toEqual(['side.verifyOtp', 'side.signOut(local)']);
  });

  it('signed in (Settings, current one forgotten): the app keeps its session and signs out only the others', async () => {
    const { calls, deps } = setup(true);
    await resetPasswordWithCode('sam@example.com', '123456', 'newpass99', deps);
    expect(calls).toEqual(['side.verifyOtp', 'side.updateUser(newpass99)', 'side.signOut(local)', 'app.signOut(others)']);
  });
});

describe('change password', () => {
  it('checks the current password on the side, never touching the app session', async () => {
    const { calls, side, deps } = setup(true);
    await changePassword('sam@example.com', 'oldpass99', 'newpass99', deps);
    expect(calls).toEqual(['side.signIn(oldpass99)', 'side.updateUser(newpass99)', 'side.signOut(local)', 'app.signOut(others)']);
    expect((side.updateUser as Mock).mock.calls[0][0]).toEqual({ password: 'newpass99', current_password: 'oldpass99' });
  });

  it('a wrong current password stops there', async () => {
    const { calls, side, deps } = setup(true);
    (side.signInWithPassword as Mock).mockResolvedValueOnce(fail('invalid_credentials', 'Invalid login credentials'));
    await expect(changePassword('sam@example.com', 'guess', 'newpass99', deps)).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(calls).toEqual([]);
  });
});
