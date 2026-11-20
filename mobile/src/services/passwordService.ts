import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendPasswordResetCode } from '@vitto/core';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient';

/**
 * Resetting a forgotten password, and changing a known one.
 *
 * Both do their work on a SEPARATE, throwaway auth client, never on the app's
 * own. Proving who you are (a reset code, or the current password) signs that
 * client in, and if it were the app's client the app would react at once:
 * a reset would carry somebody into their pet before their new password was
 * set, and a change would swap the session under Settings and reload
 * everything. On the side client nothing happens until the new password is
 * really in place; if anything fails, the app is exactly as it was.
 *
 * Afterwards every other session of the account is signed out, so whoever
 * else might have been signed in (the reason people reset a password) is not
 * any more.
 */

type Auth = SupabaseClient['auth'];

/** A client that keeps its session in memory only, and is dropped when done. */
const sideAuth = (): Auth => {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Its own name, so it never touches the app's stored session.
      storageKey: 'vitto-password-side',
    },
  }).auth;
};

/** What the work needs: the app's auth, and a way to make a side one. Swapped in tests. */
export interface PasswordDeps {
  appAuth: Auth | null | undefined;
  makeSideAuth: () => Auth;
}
const defaults = (): PasswordDeps => ({ appAuth: supabase?.auth, makeSideAuth: sideAuth });

/**
 * Sets the new password on a side client already signed in as the person, then
 * signs out every other session of the account.
 *
 * Who does the signing out matters. When this phone is signed in, its own
 * session does it ("others" from here keeps this one), so the app never sees
 * its session change. When it is signed out, the side client does it, and the
 * app then signs in with the new password like any sign-in.
 */
const setNewPassword = async (deps: PasswordDeps, side: Auth, email: string, newPassword: string, currentPassword?: string) => {
  const signedInHere = Boolean(deps.appAuth && (await deps.appAuth.getSession()).data.session);
  try {
    const { error } = await side.updateUser(
      currentPassword ? { password: newPassword, current_password: currentPassword } : { password: newPassword },
    );
    if (error) throw error;
    if (!signedInHere) await side.signOut({ scope: 'others' }).catch(() => undefined);
  } finally {
    // Forget the side session here; its server copy goes with "others" below, or expires.
    await side.signOut({ scope: 'local' }).catch(() => undefined);
  }
  if (!deps.appAuth) return;
  if (signedInHere) {
    await deps.appAuth.signOut({ scope: 'others' }).catch(() => undefined);
    return;
  }
  const { error } = await deps.appAuth.signInWithPassword({ email: email.trim(), password: newPassword });
  if (error) throw error;
};

/** Emails a reset code. Answers the same whether or not the address has an account. */
export const sendResetCode = async (email: string) => {
  const { error } = await sendPasswordResetCode(email);
  if (error) throw error;
};

/**
 * Forgot password: the emailed code proves who they are, and the new password
 * is set. Signed out, they are then signed in with it; already signed in
 * (Settings, current one forgotten), they simply stay signed in.
 */
export const resetPasswordWithCode = async (email: string, code: string, newPassword: string, deps: PasswordDeps = defaults()) => {
  const side = deps.makeSideAuth();
  const { error } = await side.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ''), type: 'recovery' });
  if (error) throw error;
  await setNewPassword(deps, side, email, newPassword);
};

/**
 * Settings: the current password proves it is them (not someone holding an
 * unlocked phone), then the new one is set. The app stays signed in throughout.
 */
export const changePassword = async (email: string, currentPassword: string, newPassword: string, deps: PasswordDeps = defaults()) => {
  const side = deps.makeSideAuth();
  const { error } = await side.signInWithPassword({ email: email.trim(), password: currentPassword });
  if (error) throw error;
  await setNewPassword(deps, side, email, newPassword, currentPassword);
};
