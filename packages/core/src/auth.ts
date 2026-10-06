import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { requireSupabase as requireClient } from './config';
import { normalizeUsername, usernameError } from './domain/friends';

export const signInWithEmail = (email: string, password: string) =>
  requireClient().auth.signInWithPassword({ email, password });

/**
 * Signup confirmation codes are 6 digits (Supabase's "Email OTP length", set to
 * 6 for this project). The app still takes up to 10, so changing that setting
 * can never break sign-up.
 */
export const SIGNUP_CODE_MIN_LENGTH = 6;
export const SIGNUP_CODE_MAX_LENGTH = 10;

/**
 * Confirms a new account with the code from its email, and signs in.
 *
 * A code rather than a link: school and work mail scanners open every link in
 * an email to check it, which spends a one-time confirmation link before the
 * person ever taps it. Nothing opens a code but the person reading it.
 */
export const verifySignupCode = (email: string, code: string) =>
  requireClient().auth.verifyOtp({ email, token: code.replace(/\D/g, ''), type: 'signup' });

/** Sends a fresh confirmation code to an account that has not been confirmed yet. */
export const resendSignupCode = (email: string) => requireClient().auth.resend({ type: 'signup', email });

/** Supabase's answer to a password sign-in on an account whose email is not confirmed yet. */
export const isEmailNotConfirmed = (cause: unknown): boolean => {
  const { code, message } = (cause ?? {}) as { code?: unknown; message?: unknown };
  return code === 'email_not_confirmed' || (typeof message === 'string' && /email not confirmed/i.test(message));
};

/**
 * Is this username free?
 *
 * Backed by the `username_available` RPC, which anon may call -- registration
 * has to ask this before an account exists, and `profiles` has no anonymous
 * SELECT policy. The RPC answers false for a malformed candidate too, so this is
 * a single "can I use this" question.
 *
 * Advisory only. Two people can pass this check at the same moment for the same
 * name; the unique index on `profiles.username` is what actually guarantees
 * uniqueness, and the loser's signup fails. This exists so that the ordinary
 * case -- the name is simply already someone else's -- is caught in the form
 * rather than as a failed registration.
 */
export const isUsernameAvailable = async (username: string): Promise<boolean> => {
  if (usernameError(username)) return false;
  const { data, error } = await requireClient().rpc('username_available', {
    candidate: normalizeUsername(username),
  });
  if (error) throw error;
  return data === true;
};

/**
 * `username` rides in the signup metadata rather than being written afterwards:
 * with email confirmation on there is no session when `signUp` resolves, so the
 * client cannot insert the profile row itself. The `handle_new_user` trigger
 * reads it from there.
 */
export const signUpWithEmail = (
  email: string,
  password: string,
  displayName: string,
  username?: string,
  /**
   * Where the confirmation link lands once it has confirmed the address. It must
   * be in Supabase's allowed redirect URLs; without it Supabase uses the
   * project's Site URL.
   */
  confirmedUrl?: string,
) =>
  requireClient().auth.signUp({
    email,
    password,
    options: {
      ...(confirmedUrl ? { emailRedirectTo: confirmedUrl } : {}),
      data: {
        display_name: displayName,
        ...(username ? { username: normalizeUsername(username) } : {}),
      },
    },
  });

/**
 * `global` (the default) revokes the session server-side too. `local` only
 * clears this device — what account deletion needs, since its user no longer
 * exists to revoke anything for.
 */
export const signOut = (scope: 'global' | 'local' = 'global') => requireClient().auth.signOut({ scope });

export const getSession = () => requireClient().auth.getSession();

export const onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) => requireClient().auth.onAuthStateChange(callback);