import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import {
  checkBirthday,
  errorMessage,
  isUsernameAvailable,
  normalizeUsername,
  signInWithEmail,
  signUpWithEmail,
  usernameError,
} from '@vitto/core';
import { ErrorText, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { LEGAL_LINKS } from '../services/billingService';
import { colors, fonts, layout, text, themedStyles } from '../theme';

/**
 * Set on this phone once someone under 13 tries to sign up, so going back and
 * entering a different birthday does not get them in (the FTC's guidance for a
 * neutral age screen). The birthday itself is never stored or sent anywhere.
 */
const UNDER_AGE_KEY = 'vitto.signupBlocked';

export function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(UNDER_AGE_KEY)
      .then((value) => setBlocked(value === '1'))
      .catch(() => undefined);
  }, []);

  const birthday = checkBirthday(birthMonth, birthYear);
  /** Signing up from a phone that has already been turned away: only sign-in is offered. */
  const signUpClosed = mode === 'sign-up' && blocked;

  // Shape only — whether it is already someone else's is a question for the
  // server, asked on submit.
  const usernameProblem = mode === 'sign-up' && username ? usernameError(username) : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'sign-up') {
        // First, before anything is sent anywhere.
        if (!birthday.ok) {
          if (birthday.reason === 'too-young') {
            setBlocked(true);
            await AsyncStorage.setItem(UNDER_AGE_KEY, '1').catch(() => undefined);
          } else {
            setError('Enter your birthday as a month (1-12) and a year.');
          }
          return;
        }
        const problem = usernameError(username);
        if (problem) {
          setError(problem);
          return;
        }
        // Checked here rather than only on keystroke so the answer is fresh at
        // the moment it matters. The unique index is still the real guarantee —
        // this turns the common "already taken" case into a form error instead
        // of a failed registration.
        if (!(await isUsernameAvailable(username))) {
          setError(`@${normalizeUsername(username)} is already taken. Try another.`);
          return;
        }
      }

      const result =
        mode === 'sign-in'
          ? await signInWithEmail(email.trim(), password)
          : await signUpWithEmail(email.trim(), password, name.trim(), username);
      if (result.error) throw result.error;
      if (mode === 'sign-up' && !result.data.session) {
        setMessage('Check your email to confirm your account.');
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Authentication failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Kicker>Vitto / your life, their story</Kicker>
        <Text style={styles.headline}>{mode === 'sign-in' ? 'Welcome back.' : 'Start your story.'}</Text>
        <Text style={styles.intro}>Sign in to save your pet and analyze meals privately.</Text>

        {mode === 'sign-up' && blocked ? (
          <View style={styles.blocked} testID="signup-blocked">
            <Text style={styles.blockedTitle}>We can't create an account for you</Text>
            <Text style={styles.blockedBody}>Vitto is for people 13 and older.</Text>
          </View>
        ) : null}

        {mode === 'sign-up' && !blocked ? (
          <Field label="Birthday">
            <View style={styles.birthday}>
              <TextInput
                style={[layout.input, styles.birthMonth]}
                value={birthMonth}
                onChangeText={(next) => setBirthMonth(next.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="MM"
                placeholderTextColor={colors.faint}
                keyboardType="number-pad"
                accessibilityLabel="Birth month"
                maxLength={2}
              />
              <TextInput
                style={[layout.input, styles.birthYear]}
                value={birthYear}
                onChangeText={(next) => setBirthYear(next.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="YYYY"
                placeholderTextColor={colors.faint}
                keyboardType="number-pad"
                accessibilityLabel="Birth year"
                maxLength={4}
              />
            </View>
          </Field>
        ) : null}

        {mode === 'sign-up' && !blocked ? (
          <Field label="Your name">
            <TextInput
              style={layout.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.faint}
              autoCapitalize="words"
            />
          </Field>
        ) : null}

        {mode === 'sign-up' && !blocked ? (
          <Field label="Username" hint="3-20 characters: a-z, 0-9, _">
            <TextInput
              style={layout.input}
              value={username}
              // Normalised as it is typed, so what you see is what gets stored
              // and a capital letter is not a rejection.
              onChangeText={(next) => setUsername(normalizeUsername(next))}
              placeholder="kyle_li"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            {usernameProblem ? <Text style={styles.hint}>{usernameProblem}</Text> : null}
          </Field>
        ) : null}

        {signUpClosed ? null : (
          <>
            <Field label="Email">
              <TextInput
                style={layout.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.faint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
              />
            </Field>

            <Field label="Password" hint="6 characters minimum">
              <TextInput
                style={layout.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••"
                placeholderTextColor={colors.faint}
                secureTextEntry
                textContentType="password"
              />
            </Field>
          </>
        )}

        <ErrorText>{error}</ErrorText>
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.actions}>
          {signUpClosed ? null : (
            <PrimaryButton
              label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
              busy={busy}
              disabled={
                !email ||
                password.length < 6 ||
                (mode === 'sign-up' && (usernameError(username) !== null || (!birthday.ok && birthday.reason !== 'too-young')))
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
          <TextButton
            label={mode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}
            onPress={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setError(null);
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => ({
  body: { padding: 22, paddingTop: 90, paddingBottom: 60 },
  headline: { ...text.display, marginTop: 18 },
  intro: { ...text.body, marginTop: 12, color: colors.muted },
  message: { fontFamily: fonts.mono, fontSize: 11, color: colors.mintDeep, marginTop: 12 },
  hint: { fontFamily: fonts.mono, fontSize: 10, color: colors.danger, marginTop: 6 },
  actions: { marginTop: 30, gap: 18 },
  blocked: {
    marginTop: 26,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  blockedTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  blockedBody: { fontSize: 14, color: colors.muted, marginTop: 4 },
  birthday: { flexDirection: 'row', gap: 10 },
  birthMonth: { width: 80, textAlign: 'center' },
  birthYear: { width: 110, textAlign: 'center' },
  legal: { fontSize: 12, lineHeight: 17, color: colors.muted, textAlign: 'center', marginTop: -6 },
  legalLink: { color: colors.ink, textDecorationLine: 'underline' },
}));
