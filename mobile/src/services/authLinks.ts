import { Linking } from 'react-native';
import { supabase } from './supabaseClient';

/**
 * Signing in straight from the confirmation email.
 *
 * Supabase confirms the address, then sends the browser to our hosted
 * "confirmed" page with a session in the URL fragment. On a phone that page
 * forwards the fragment to `vitto://auth-callback#…`, which opens this app;
 * here the session is installed, `onAuthStateChange` fires, and someone with
 * no pet yet lands in onboarding. Opened anywhere else, the page just says to
 * sign in, so nothing depends on this.
 */
const CALLBACK = 'auth-callback';

/** The `#access_token=…&refresh_token=…` part of a callback link, or null. */
export const sessionFromLink = (url: string): { accessToken: string; refreshToken: string } | null => {
  if (!url.startsWith('vitto://') || !url.includes(CALLBACK)) return null;
  const fragment = url.split('#')[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
};

const signInFrom = async (url: string | null) => {
  if (!url || !supabase) return;
  const tokens = sessionFromLink(url);
  if (!tokens) return;
  // setSession verifies the token with the server before installing it, so a
  // forged link does not sign anyone in.
  await supabase.auth
    .setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
    .catch(() => undefined);
};

/** Handles a link that launched the app, and any that arrive while it runs. Returns the unsubscribe. */
export const listenForAuthLinks = (): (() => void) => {
  void Linking.getInitialURL().then(signInFrom).catch(() => undefined);
  const subscription = Linking.addEventListener('url', ({ url }) => void signInFrom(url));
  return () => subscription.remove();
};
