import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_* variables.');
  return supabase;
};

export const signInWithEmail = (email: string, password: string) =>
  requireClient().auth.signInWithPassword({ email, password });

export const signUpWithEmail = (email: string, password: string, displayName: string) =>
  requireClient().auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

export const signOut = () => requireClient().auth.signOut();

export const getSession = () => requireClient().auth.getSession();

export const onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) => requireClient().auth.onAuthStateChange(callback);