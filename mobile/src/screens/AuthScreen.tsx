import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  errorMessage,
  isUsernameAvailable,
  normalizeUsername,
  signInWithEmail,
  signUpWithEmail,
  usernameError,
} from '@vitto/core';
import { ErrorText, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

export function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Shape only — whether it is already someone else's is a question for the
  // server, asked on submit.
  const usernameProblem = mode === 'sign-up' && username ? usernameError(username) : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'sign-up') {
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

        {mode === 'sign-up' ? (
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

        {mode === 'sign-up' ? (
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

        <ErrorText>{error}</ErrorText>
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.actions}>
          <PrimaryButton
            label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            busy={busy}
            disabled={
              !email || password.length < 6 || (mode === 'sign-up' && usernameError(username) !== null)
            }
            onPress={() => void submit()}
          />
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

const styles = StyleSheet.create({
  body: { padding: 22, paddingTop: 90, paddingBottom: 60 },
  headline: { ...text.display, marginTop: 18 },
  intro: { ...text.body, marginTop: 12, color: colors.muted },
  message: { fontFamily: fonts.mono, fontSize: 11, color: colors.mintDeep, marginTop: 12 },
  hint: { fontFamily: fonts.mono, fontSize: 10, color: colors.danger, marginTop: 6 },
  actions: { marginTop: 30, gap: 18 },
});
