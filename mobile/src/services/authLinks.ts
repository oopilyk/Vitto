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
  // Only a sign-up confirmation signs in from a link. A password-reset link
  // (type=recovery) would otherwise sign someone in without a new password
  // ever being set; resets go through the emailed code instead.
  const type = params.get('type');
  if (type && type !== 'signup') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
};

/** The two calls a callback link needs, so the rule below can be tested without a server. */
type LinkAuth = {
  getSession: () => Promise<{ data: { session: unknown } }>;
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<unknown>;
};

/**
 * Installs the session a callback link carries, but only into an app that is
 * signed out. Any app or web page can open a `vitto://` link, and the link
 * decides which account it signs into: without this, one tap on a crafted
 * link would quietly swap a signed-in person onto somebody else's account,
 * and everything they logged after that would land there. The confirmation
 * email only ever arrives while signed out, so nothing real is refused.
 */
export const signInFromLink = async (url: string | null, auth: LinkAuth | null | undefined = supabase?.auth) => {
  if (!url || !auth) return;
  const tokens = sessionFromLink(url);
  if (!tokens) return;
  try {
    const { data } = await auth.getSession();
    if (data.session) return;
    // setSession verifies the token with the server before installing it, so a
    // forged link does not sign anyone in.
    await auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  } catch {
    // A link that cannot be used leaves the app exactly as it was.
  }
};

/** Handles a link that launched the app, and any that arrive while it runs. Returns the unsubscribe. */
export const listenForAuthLinks = (): (() => void) => {
  void Linking.getInitialURL().then((url) => signInFromLink(url)).catch(() => undefined);
  const subscription = Linking.addEventListener('url', ({ url }) => void signInFromLink(url));
  return () => subscription.remove();
};
