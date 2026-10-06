import { type ReactNode, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useFonts, Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold } from '@expo-google-fonts/rubik';
import {
  checkBirthday,
  errorMessage,
  isEmailNotConfirmed,
  signInWithEmail,
  resendSignupCode,
  SIGNUP_CODE_MAX_LENGTH,
  SIGNUP_CODE_MIN_LENGTH,
  signUpWithEmail,
  verifySignupCode,
} from '@vitto/core';
import { BirthdayPicker } from '../components/BirthdayPicker';
import { ONB_FONT, OnbButton, OnbInput, onboardingPalette, onboardingText as T } from '../components/onboardingKit';
import { LEGAL_LINKS } from '../services/billingService';
import { themedStyles } from '../theme';

/**
 * When someone under 13 last tried to sign up on this phone, so going straight
 * back and entering a different birthday does not get them in (the FTC's
 * guidance for a neutral age screen). It lifts after a day, so an adult who
 * mis-tapped is not locked out for good. The birthday itself is never stored
 * or sent anywhere.
 */
const UNDER_AGE_KEY = 'vitto.signupBlocked';
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
  /** The "is everything right?" page between the sign-up form and creating the account. */
  const [reviewing, setReviewing] = useState(false);
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

  const birthday = checkBirthday(birthMonth, birthYear);
  /** Signing up from a phone that has already been turned away: only sign-in is offered. */
  const signUpClosed = mode === 'sign-up' && blocked;

  const submit = async (reviewed = false) => {
    // Sign-up goes through a review page first, for everyone and whatever age
    // they picked, before anything is checked or sent: a mis-tap is caught
    // there, and showing every age the same page gives nothing away about
    // which ages are turned away.
    if (mode === 'sign-up' && !reviewed) {
      if (!birthday.ok && birthday.reason !== 'too-young') {
        setError('Choose your birthday.');
        return;
      }
      setError(null);
      setReviewing(true);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'sign-up') {
        // First, before anything is sent anywhere.
        if (!birthday.ok) {
          if (birthday.reason === 'too-young') {
            setReviewing(false);
            setBlocked(true);
            await AsyncStorage.setItem(UNDER_AGE_KEY, String(Date.now())).catch(() => undefined);
          } else {
            setError('Choose your birthday.');
          }
          return;
        }
      }

      const result =
        mode === 'sign-in'
          ? await signInWithEmail(email.trim(), password)
          : // No name or username here: onboarding asks for both, once the
          // address is confirmed, so an unconfirmed sign-up never holds a
          // username.
          await signUpWithEmail(email.trim(), password, '', undefined, process.env.EXPO_PUBLIC_EMAIL_CONFIRMED_URL || undefined);
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
    const rows: [string, string][] = [
      ['Birthday', `${MONTH_NAMES[Number(birthMonth) - 1]} ${birthYear}`],
      ['Email', email.trim()],
    ];
    return (
      <Page testID="signup-review">
        <Text style={T.eyebrow}>Almost there</Text>
        <Text style={T.title}>Is everything right?</Text>
        <Text style={T.sub}>Check your details before we create your account.</Text>

        <View style={[T.card, styles.review]}>
          {rows.map(([label, value], index) => (
            <View key={label} style={[styles.reviewRow, index > 0 && styles.reviewRule]}>
              <Text style={T.body}>{label}</Text>
              <Text style={styles.reviewValue} numberOfLines={1}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        {error ? <Text style={[T.error, styles.notice]}>{error}</Text> : null}

        <View style={styles.actions}>
          <OnbButton label="Create account" busy={busy} onPress={() => void submit(true)} />
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
          <TextLink
            label="Go back and edit"
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
        <Field label="Birthday">
          <BirthdayPicker
            month={birthMonth}
            year={birthYear}
            onChange={(month, year) => {
              setBirthMonth(month);
              setBirthYear(year);
              setReviewing(false);
            }}
          />
        </Field>
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
            label={mode === 'sign-in' ? 'Sign in' : 'Continue'}
            busy={busy}
            disabled={
              !email ||
              password.length < 6 ||
              (mode === 'sign-up' && !birthday.ok && birthday.reason !== 'too-young')
            }
            onPress={() => void submit()}
          />
        )}
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
    review: { marginTop: 24, paddingVertical: 4 },
    reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
    reviewRule: { borderTopWidth: 1, borderTopColor: F.border },
    reviewValue: { flexShrink: 1, fontFamily: ONB_FONT.semibold, fontSize: 16, color: F.text, textAlign: 'right' },
    legal: { fontFamily: ONB_FONT.regular, fontSize: 13, lineHeight: 18, color: F.sub, textAlign: 'center' },
    legalLink: { fontFamily: ONB_FONT.medium, color: F.text, textDecorationLine: 'underline' },
  };
});
