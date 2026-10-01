import { Text, View } from 'react-native';
import type { AppearancePreference, ColorScheme } from '../theme';
import { colors, themedStyles } from '../theme';
import { SelectionList, SettingsPage, SettingsSection } from '../components/settingsKit';

interface Props {
  preference: AppearancePreference;
  /** What is showing now, so "System" can say which way the phone is set. */
  scheme: ColorScheme;
  onChange: (next: AppearancePreference) => void;
  onClose: () => void;
}

export const APPEARANCE_LABEL: Record<AppearancePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** Light, dark, or whatever the phone is set to (from Settings). Applies at once. */
export function AppearanceScreen({ preference, scheme, onChange, onClose }: Props) {
  return (
    <SettingsPage title="Appearance" backLabel="Settings" onBack={onClose}>
      <SettingsSection title="Theme" description="Your pet's rooms keep their own day and night either way." first>
        <SelectionList
          options={[
            { value: 'system' as const, label: 'System', detail: `Matches your phone. ${scheme === 'dark' ? 'Dark' : 'Light'} right now.` },
            { value: 'light' as const, label: 'Light', detail: 'Warm paper, always' },
            { value: 'dark' as const, label: 'Dark', detail: 'Easy on the eyes at night' },
          ]}
          value={preference}
          onChange={onChange}
        />
        <View style={styles.preview} testID="appearance-preview">
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>How it looks</Text>
            <Text style={styles.previewBody}>Text, cards and buttons all follow the theme.</Text>
            <View style={styles.previewButton}>
              <Text style={styles.previewButtonLabel}>A button</Text>
            </View>
          </View>
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  preview: { padding: 16, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.hairline },
  previewCard: { padding: 16, borderRadius: 12, backgroundColor: colors.card, gap: 6 },
  previewTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  previewBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  previewButton: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.coral },
  previewButtonLabel: { fontSize: 14, fontWeight: '700', color: colors.onCoral },
}));
