import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { NEW_PASSWORD_MIN_LENGTH, SIGNUP_CODE_MAX_LENGTH, SIGNUP_CODE_MIN_LENGTH, passwordErrorMessage } from '@vitto/core';
import { FormField, PinnedBar, SettingsPage, TextField, kit } from '../components/settingsKit';
import { PrimaryButton, TextButton } from '../components/ui';
import { changePassword, resetPasswordWithCode, sendResetCode } from '../services/passwordService';
import { colors, fonts, themedStyles } from '../theme';

interface Props {
  /** The signed-in account's address: what the current password is checked against, and where a code goes. */
  email: string;
  onClose: () => void;
}

const RESEND_AFTER_SECONDS = 60;

/**
 * Changing the password, from Settings. The current password proves it is the
 * account's owner and not just someone holding an unlocked phone; forgotten,
 * a code emailed to the account does the same. Either way every other device
 * is signed out afterwards, and this one stays signed in.
 */
export function ChangePasswordScreen({ email, onClose }: Props) {
  /** `current`: proving it with the current password. `code`: with an emailed code instead. */
  const [proof, setProof] = useState<'current' | 'code'>('current');
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const proven = proof === 'current' ? current.length > 0 : code.replace(/\D/g, '').length >= SIGNUP_CODE_MIN_LENGTH;
  const ready = proven && next.length >= NEW_PASSWORD_MIN_LENGTH;

  const emailCode = async () => {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await sendResetCode(email);
      setProof('code');
      setCode('');
      setNote(`We sent a ${SIGNUP_CODE_MIN_LENGTH}-digit code to ${email}.`);
      setResendIn(RESEND_AFTER_SECONDS);
    } catch (cause) {
      setError(passwordErrorMessage(cause, 'Could not send a code. Try again in a minute.'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!ready) return;
    setError(null);
    setBusy(true);
    try {
      if (proof === 'current') await changePassword(email, current, next);
      else await resetPasswordWithCode(email, code, next);
      setDone(true);
    } catch (cause) {
      setError(passwordErrorMessage(cause, 'Could not change your password.'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <SettingsPage title="Change password" backLabel="Settings" onBack={onClose}>
        <View style={styles.done} testID="password-changed">
          <Text style={styles.doneTitle}>Password changed</Text>
          <Text style={styles.doneBody}>Use it next time you sign in. Any other phone signed in to your account has been signed out.</Text>
        </View>
        <PrimaryButton label="Done" onPress={onClose} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Change password"
      backLabel="Settings"
      onBack={onClose}
      footer={
        <PinnedBar>
          {error ? <Text style={kit.saveError}>{error}</Text> : null}
          <PrimaryButton label={busy ? 'Saving...' : 'Change password'} busy={busy} disabled={!ready || busy} onPress={() => void save()} />
        </PinnedBar>
      }
    >
      {proof === 'current' ? (
        <FormField label="Current password">
          <TextField
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            autoCapitalize="none"
            accessibilityLabel="Current password"
          />
        </FormField>
      ) : (
        <FormField label="Code from your email">
          <TextField
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, SIGNUP_CODE_MAX_LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder={'0'.repeat(SIGNUP_CODE_MIN_LENGTH)}
            maxLength={SIGNUP_CODE_MAX_LENGTH}
            accessibilityLabel="Code from your email"
          />
        </FormField>
      )}

      <FormField label="New password" hint={`${NEW_PASSWORD_MIN_LENGTH} characters minimum`}>
        <TextField
          value={next}
          onChangeText={setNext}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          accessibilityLabel="New password"
        />
      </FormField>

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <View style={styles.links}>
        {proof === 'current' ? (
          <TextButton label="Forgot your current password?" tone="coral" disabled={busy} onPress={() => void emailCode()} />
        ) : (
          <>
            <TextButton
              label={resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
              disabled={busy || resendIn > 0}
              onPress={() => void emailCode()}
            />
            <TextButton
              label="Use my current password instead"
              disabled={busy}
              onPress={() => {
                setProof('current');
                setNote(null);
                setError(null);
              }}
            />
          </>
        )}
      </View>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  links: { alignItems: 'flex-start', gap: 4, marginTop: 4 },
  note: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted, marginTop: 4 },
  done: { gap: 8, marginBottom: 20 },
  doneTitle: { fontFamily: fonts.ui, fontSize: 20, fontWeight: '700', color: colors.ink },
  doneBody: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21, color: colors.muted },
}));
