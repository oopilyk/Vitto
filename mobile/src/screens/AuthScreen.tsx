import { type ReactNode, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useFonts, Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold } from '@expo-google-fonts/rubik';
import {
  checkBirthYear,
  errorMessage,
  isEmailNotConfirmed,
  signInWithEmail,
  resendSignupCode,
  SIGNUP_CODE_MAX_LENGTH,
  SIGNUP_CODE_MIN_LENGTH,
  signUpWithEmail,
  verifySignupCode,
} from '@vitto/core';
import { ONB_FONT, OnbButton, OnbInput, onboardingPalette, onboardingText as T } from '../components/onboardingKit';
import { LEGAL_LINKS } from '../services/billingService';
import { SpriteFrame } from '../components/SpriteFrame';
import { portraitFrame, sheetByBreed } from '../components/petSprites';
import { themedStyles } from '../theme';

/**
 * When someone under 13 last tried to sign up on this phone, so going straight
 * back and entering a different birthday does not get them in (the FTC's
 * guidance for a neutral age screen). It lifts after a day, so an adult who
 * mis-tapped is not locked out for good. The birthday itself is never stored
 * or sent anywhere.
 */
const UNDER_AGE_KEY = 'vitto.signupBlocked';
/** Set once anyone has signed in on this phone (see App.tsx): after that, it opens on sign-in. */
export const HAS_SIGNED_IN_KEY = 'vitto.hasSignedIn';
const UNDER_AGE_BLOCK_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** Supabase will not send another confirmation email sooner than this. */
const RESEND_AFTER_SECONDS = 60;

/** A quiet text button in the kit's type: the secondary actions under the main one. */
function TextLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={8} style={({ pressed }) => [styles.link, (pressed || disabled) && styles.linkDim]}>
      <Text style={T.link}>{label}</Text>
    </Pressable>
  );
}

/** A labelled field, with an optional quieter hint after the label. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={T.label}>
        {label}
        {hint ? <Text style={T.labelHint}>{`  ${hint}`}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

/** The page frame every state of this screen shares: the kit's surface, keyboard-aware. */
function Page({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <KeyboardAvoidingView style={T.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" testID={testID}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthScreen() {
  // The same rounded face as onboarding, so signing up and onboarding read as one flow.
  useFonts({ Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold });
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [blocked, setBlocked] = useState(false);
  /** The "Born in 2015?" check an under-13 answer gets before the phone is turned away. */
  const [reviewing, setReviewing] = useState(false);
  /**
   * A first launch opens on a welcome screen and then sign-up; a phone that has
   * signed in before opens on sign-in. Null while that is being read.
   */
  const [welcome, setWelcome] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(HAS_SIGNED_IN_KEY)
      .then((value) => setWelcome(value !== '1'))
      .catch(() => setWelcome(false));
  }, []);
  /** The address a confirmation code went to; while set, the screen asks for the code. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /** Moves to the code step for `address`; the code itself is already on its way. */
  const askForCode = (address: string) => {
    setConfirming(address);
    setCode('');
    setError(null);
    setResendIn(RESEND_AFTER_SECONDS);
  };

  const confirm = async () => {
    if (!confirming) return;
    setBusy(true);
    setError(null);
    try {
      // On success Supabase signs in, and the app moves on (to onboarding, for a
      // new account) by itself.
      const { error: verifyError } = await verifySignupCode(confirming, code);
      if (verifyError) throw verifyError;
    } catch (cause) {
      // Supabase's own wording, before errorMessage turns it into a generic one.
      const raw = String((cause as { message?: unknown } | null)?.message ?? '');
      setError(
        /expired|invalid|token/i.test(raw)
          ? "That code didn't work. Check it, or send a new one."
          : errorMessage(cause, 'Could not confirm that code.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!confirming || resendIn > 0) return;
    setError(null);
    setMessage(null);
    try {
      const { error: resendError } = await resendSignupCode(confirming);
      if (resendError) throw resendError;
      setMessage('A new code is on its way.');
      setResendIn(RESEND_AFTER_SECONDS);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not send a new code. Try again in a minute.'));
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(UNDER_AGE_KEY)
      .then((value) => {
        const since = Number(value);
        if (Number.isFinite(since) && Date.now() - since < UNDER_AGE_BLOCK_MS) setBlocked(true);
        else if (value !== null) void AsyncStorage.removeItem(UNDER_AGE_KEY);
      })
      .catch(() => undefined);
  }, []);

  // The year first; the month only if that year alone cannot settle it.
  const birthday = checkBirthYear(birthYear, birthMonth);
  const yearAlone = checkBirthYear(birthYear);
  const askMonth = !yearAlone.ok && yearAlone.reason === 'needs-month';
  /** Signing up from a phone that has already been turned away: only sign-in is offered. */
  const signUpClosed = mode === 'sign-up' && blocked;

  /**
   * `confirmedYoung`: an under-13 answer is checked back once ("Born in
   * 2015?") before it turns the phone away, so a slip of the thumb is not a
   * day's lockout. Every other answer goes straight through: no review page
   * standing between someone and their account.
   */
  const submit = async (confirmedYoung = false) => {
    if (mode === 'sign-up' && !birthday.ok) {
      // First, before anything is sent anywhere.
      if (birthday.reason === 'too-young') {
        if (!confirmedYoung) {
          setError(null);
          setReviewing(true);
          return;
        }
        setReviewing(false);
        setBlocked(true);
        await AsyncStorage.setItem(UNDER_AGE_KEY, String(Date.now())).catch(() => undefined);
        return;
      }
      setError(birthday.reason === 'needs-month' ? 'Choose the month you were born.' : 'Enter the year you were born.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {

      const result =
        mode === 'sign-in'
          ? await signInWithEmail(email.trim(), password)
          : // No name or username here: onboarding asks for both, once the
          // address is confirmed, so an unconfirmed sign-up never holds a
          // username.
          await signUpWithEmail(
            email.trim(),
            password,
            '',
            undefined,
            process.env.EXPO_PUBLIC_EMAIL_CONFIRMED_URL || undefined,
            // The age only, so onboarding need not ask it again.
            birthday.ok ? birthday.age : undefined,
          );
      if (result.error) throw result.error;
      // An address that already has a confirmed account: Supabase answers as if
      // it had signed up (a user with no identities) but creates nothing and
      // sends no code, so the code page would wait forever. Say so, and offer
      // sign-in with the address kept.
      if (mode === 'sign-up' && result.data.user && result.data.user.identities?.length === 0) {
        setReviewing(false);
        setMode('sign-in');
        setPassword('');
        setError('An account with this email already exists. Sign in instead.');
        return;
      }
      // No session yet: the address needs confirming, with the code just sent.
      if (mode === 'sign-up' && !result.data.session) askForCode(email.trim());
    } catch (cause) {
      // Signed up earlier but never confirmed: send a fresh code and ask for it,
      // rather than leave them at an error they cannot act on.
      if (mode === 'sign-in' && isEmailNotConfirmed(cause)) {
        askForCode(email.trim());
        await resendSignupCode(email.trim()).catch(() => undefined);
        return;
      }
      setError(errorMessage(cause, 'Authentication failed.'));
    } finally {
      setBusy(false);
    }
  };

  // Nothing until it is known which to show, so a returning person never
  // sees the welcome flash past on the way to sign-in.
  if (welcome === null) return <View style={T.screen} />;

  if (welcome) {
    const sheet = sheetByBreed('bichon');
    return (
      <Page testID="welcome">
        <View style={styles.welcomePet}>
          <SpriteFrame sheet={sheet} frame={portraitFrame(sheet)} size={150} />
        </View>
        <Text style={T.eyebrow}>Vitto</Text>
        <Text style={T.title}>Meet the pet that grows with you</Text>
        <Text style={T.sub}>Eat well, move, rest and play, and your pet thrives, levels up and evolves right alongside you.</Text>
        <View style={styles.actions}>
          <OnbButton
            label="Get started"
            onPress={() => {
              setWelcome(false);
              setMode('sign-up');
            }}
          />
          <TextLink
            label="I already have an account"
            onPress={() => {
              setWelcome(false);
              setMode('sign-in');
            }}
          />
        </View>
      </Page>
    );
  }

  if (confirming) {
    const complete = code.replace(/\D/g, '').length >= SIGNUP_CODE_MIN_LENGTH;
    return (
      <Page testID="confirm-code">
        <Text style={T.eyebrow}>One last step</Text>
        <Text style={T.title}>Check your email</Text>
        <Text style={T.sub}>{`We sent a ${SIGNUP_CODE_MIN_LENGTH}-digit code to ${confirming}. Enter it to confirm your account.`}</Text>

        <OnbInput
          style={styles.code}
          value={code}
          onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, SIGNUP_CODE_MAX_LENGTH))}
          placeholder={'0'.repeat(SIGNUP_CODE_MIN_LENGTH)}
          keyboardType="number-pad"
          // iOS offers the code from Mail above the keyboard.
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          maxLength={SIGNUP_CODE_MAX_LENGTH}
          accessibilityLabel="Confirmation code"
        />

        {error ? <Text style={[T.error, styles.notice]}>{error}</Text> : null}
        {message ? <Text style={[T.success, styles.notice]}>{message}</Text> : null}

        <View style={styles.actions}>
          <OnbButton label="Confirm" busy={busy} disabled={!complete} onPress={() => void confirm()} />
          <TextLink
            label={resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
            disabled={resendIn > 0}
            onPress={() => void resend()}
          />
          <TextLink
            label="Use a different email"
            onPress={() => {
              setConfirming(null);
              setError(null);
              setMessage(null);
            }}
          />
        </View>
      </Page>
    );
  }

  if (reviewing && mode === 'sign-up' && !blocked) {
    const when = birthMonth ? `${MONTH_NAMES[Number(birthMonth) - 1]} ${birthYear}` : birthYear;
    return (
      <Page testID="signup-confirm-age">
        <Text style={T.eyebrow}>Just checking</Text>
        <Text style={T.title}>{`Born in ${when}?`}</Text>
        <Text style={T.sub}>Make sure that's right before we go on.</Text>
        <View style={styles.actions}>
          <OnbButton label="Yes, that's right" onPress={() => void submit(true)} />
          <TextLink
            label="No, let me fix it"
            onPress={() => {
              setReviewing(false);
              setError(null);
            }}
          />
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <Text style={T.eyebrow}>Vitto</Text>
      <Text style={T.title}>{mode === 'sign-in' ? 'Welcome back' : 'Start your story'}</Text>
      <Text style={T.sub}>{mode === 'sign-in' ? 'Sign in to see your pet.' : 'Make an account to save your pet.'}</Text>

      {mode === 'sign-up' && blocked ? (
        <View style={[T.card, styles.blocked]} testID="signup-blocked">
          <Text style={styles.blockedTitle}>We can't create an account for you</Text>
          <Text style={T.body}>Vitto is for people 13 and older.</Text>
          {/* Back out to sign-in, not to the birthday: going back to pick an
              older year would defeat the check. */}
          <View style={styles.blockedBack}>
            <OnbButton
              label="Back to sign in"
              tone="secondary"
              onPress={() => {
                setMode('sign-in');
                setError(null);
              }}
            />
          </View>
        </View>
      ) : null}

      {mode === 'sign-up' && !blocked ? (
        <>
          <Field label="Year you were born">
            <OnbInput
              form
              value={birthYear}
              onChangeText={(next) => {
                setBirthYear(next.replace(/\D/g, '').slice(0, 4));
                setBirthMonth('');
                setReviewing(false);
              }}
              placeholder="YYYY"
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel="Year you were born"
            />
          </Field>
          {/* Only when the year alone cannot settle the age check. */}
          {askMonth ? (
            <Field label="And the month">
              <View style={styles.months} accessibilityRole="radiogroup">
                {MONTH_NAMES.map((name, index) => {
                  const value = String(index + 1);
                  const on = birthMonth === value;
                  return (
                    <Pressable
                      key={name}
                      accessibilityRole="radio"
                      accessibilityLabel={name}
                      accessibilityState={{ selected: on }}
                      onPress={() => setBirthMonth(value)}
                      style={[styles.month, on && styles.monthOn]}
                    >
                      <Text style={[styles.monthLabel, on && styles.monthLabelOn]}>{name.slice(0, 3)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          ) : null}
        </>
      ) : null}

      {signUpClosed ? null : (
        <>
          <Field label="Email">
            <OnbInput
              form
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />
          </Field>

          <Field label="Password" hint="6 characters minimum">
            <OnbInput form value={password} onChangeText={setPassword} placeholder="••••••" secureTextEntry textContentType="password" />
          </Field>
        </>
      )}

      {error ? <Text style={[T.error, styles.notice]}>{error}</Text> : null}
      {message ? <Text style={[T.success, styles.notice]}>{message}</Text> : null}

      <View style={styles.actions}>
        {signUpClosed ? null : (
          <OnbButton
            label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            busy={busy}
            disabled={
              !email ||
              password.length < 6 ||
              (mode === 'sign-up' && !birthday.ok && birthday.reason !== 'too-young')
            }
            onPress={() => void submit()}
          />
        )}
        {mode === 'sign-up' && !signUpClosed ? (
          <Text style={styles.legal} testID="signup-legal">
            {'By creating an account, you agree to our '}
            <Text style={styles.legalLink} accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_LINKS.terms)}>
              Terms of Use
            </Text>
            {LEGAL_LINKS.privacy ? (
              <>
                {' and '}
                <Text style={styles.legalLink} accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_LINKS.privacy!)}>
                  Privacy Policy
                </Text>
              </>
            ) : null}
            .
          </Text>
        ) : null}
        <TextLink
          label={mode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}
          onPress={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setReviewing(false);
            setError(null);
          }}
        />
      </View>
    </Page>
  );
}

const styles = themedStyles(() => {
  const F = onboardingPalette();
  return {
    body: { paddingHorizontal: 24, paddingTop: 84, paddingBottom: 48 },
    column: { width: '100%', maxWidth: 440, alignSelf: 'center' },
    field: { marginTop: 20 },
    notice: { marginTop: 14, textAlign: 'center' },
    actions: { marginTop: 28, gap: 14 },
    link: { alignItems: 'center', paddingVertical: 8 },
    linkDim: { opacity: 0.5 },
    code: { marginTop: 26, height: 64, fontSize: 30, letterSpacing: 8, fontFamily: ONB_FONT.semibold },
    blocked: { marginTop: 24, gap: 4 },
    blockedTitle: { fontFamily: ONB_FONT.semibold, fontSize: 17, lineHeight: 22, color: F.text },
    blockedBack: { marginTop: 14 },
    welcomePet: { alignItems: 'center', marginBottom: 24, marginTop: 12 },
    months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    month: {
      width: '22%',
      flexGrow: 1,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.input,
      alignItems: 'center',
    },
    monthOn: { borderColor: F.green, backgroundColor: F.greenPale },
    monthLabel: { fontFamily: ONB_FONT.medium, fontSize: 15, color: F.text },
    monthLabelOn: { fontFamily: ONB_FONT.bold, color: F.green },
    legal: { fontFamily: ONB_FONT.regular, fontSize: 13, lineHeight: 18, color: F.sub, textAlign: 'center' },
    legalLink: { fontFamily: ONB_FONT.medium, color: F.text, textDecorationLine: 'underline' },
  };
});
