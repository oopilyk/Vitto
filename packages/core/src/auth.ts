import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { requireSupabase as requireClient } from './config';
import { normalizeUsername, usernameError } from './domain/friends';

export const signInWithEmail = (email: string, password: string) =>
  requireClient().auth.signInWithPassword({ email, password });

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
) =>
  requireClient().auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        ...(username ? { username: normalizeUsername(username) } : {}),
      },
    },
  });

export const signOut = () => requireClient().auth.signOut();

export const getSession = () => requireClient().auth.getSession();

export const onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) => requireClient().auth.onAuthStateChange(callback);