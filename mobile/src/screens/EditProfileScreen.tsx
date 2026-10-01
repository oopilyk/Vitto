import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type BodyProfile, MAX_BIO_LENGTH, normalizeBio } from '@vitto/core';
import { FormField, SaveBar, SettingsPage, SettingsSection, TextField } from '../components/settingsKit';
import { colors, fonts } from '../theme';

interface Props {
  profile: BodyProfile;
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
  /** Opens Friends, which owns claiming a username. This page never writes it. Absent offline. */
  onOpenFriends?: () => void;
}

/** Longest a display name can be; matches the server-side `left(..., 40)`. */
const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Edit profile: the name and the bio, the two things a person writes about
 * themselves (from Profile's header). The handle is shown but owned by
 * Friends, since claiming one is a server round-trip with its own rules.
 */
export function EditProfileScreen({ profile: initial, onSave, onClose, onOpenFriends }: Props) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(profile) !== JSON.stringify(initial), [profile, initial]);

  const update = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...profile, bio: normalizeBio(profile.bio ?? '') });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const avatarLetter = (profile.username || profile.displayName?.trim() || '?').slice(0, 1).toUpperCase();

  return (
    <SettingsPage
      title="Edit profile"
      backLabel="Profile"
      onBack={onClose}
      footer={dirty ? <SaveBar saving={saving} error={error} onSave={() => void save()} onDiscard={() => setProfile(initial)} /> : null}
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{avatarLetter}</Text>
        </View>
        <View style={styles.identityText}>
          {profile.username ? (
            <Text style={styles.handle}>{`@${profile.username}`}</Text>
          ) : (
            <Text style={styles.handleUnset}>No username yet</Text>
          )}
          {onOpenFriends ? (
            <Pressable accessibilityRole="button" onPress={onOpenFriends} hitSlop={6}>
              <Text style={styles.handleLink}>{profile.username ? 'Change it in Friends' : 'Pick a username in Friends'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <SettingsSection title="About you" description="Friends see your username and your bio. Your name is just for you." first>
        <FormField label="Name" hint="only you see this">
          <TextField
            value={profile.displayName ?? ''}
            onChangeText={(value) => update('displayName', value)}
            placeholder="Your name"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            accessibilityLabel="Your display name"
            returnKeyType="done"
          />
        </FormField>
        <FormField label="Bio" hint={`${(profile.bio ?? '').length} / ${MAX_BIO_LENGTH}`}>
          <TextField
            value={profile.bio ?? ''}
            onChangeText={(value) => update('bio', value.slice(0, MAX_BIO_LENGTH))}
            placeholder="What you are training for, what you are working on."
            multiline
            maxLength={MAX_BIO_LENGTH}
            accessibilityLabel="Your bio"
            style={styles.bio}
          />
        </FormField>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe7d8',
  },
  avatarInitial: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  identityText: { flex: 1, gap: 4 },
  handle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  handleUnset: { fontSize: 16, color: colors.muted },
  handleLink: { fontSize: 14, fontWeight: '600', color: colors.coral },
  bio: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top', lineHeight: 20 },
});
