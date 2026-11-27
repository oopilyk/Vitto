import { Text, View } from 'react-native';
import type { AppearancePreference, ColorScheme } from '../theme';
import { colors, themedStyles, fonts } from '../theme';
import { SelectionList, SettingsPage, SettingsSection } from '../components/settingsKit';
import { t, tx } from '../i18n';

interface Props {
  preference: AppearancePreference;
  /** What is showing now, so "System" can say which way the phone is set. */
  scheme: ColorScheme;
  onChange: (next: AppearancePreference) => void;
  onClose: () => void;
}

export const APPEARANCE_LABEL: Record<AppearancePreference, string> = {
  system: tx('appearance: follow the phone', 'System'),
  light: tx('appearance: the light theme', 'Light'),
  dark: tx('appearance: the dark theme', 'Dark'),
};

/** Light, dark, or whatever the phone is set to (from Settings). Applies at once. */
export function AppearanceScreen({ preference, scheme, onChange, onClose }: Props) {
  return (
    <SettingsPage title={t('Appearance')} backLabel={t('Settings')} onBack={onClose}>
      <SettingsSection title={t('Theme')} description={t("Your pet's rooms keep their own day and night either way.")} first>
        <SelectionList
          options={[
            { value: 'system' as const, label: APPEARANCE_LABEL.system, detail: scheme === 'dark' ? t('Matches your phone. Dark right now.') : t('Matches your phone. Light right now.') },
            { value: 'light' as const, label: APPEARANCE_LABEL.light, detail: t('Warm paper, always') },
            { value: 'dark' as const, label: APPEARANCE_LABEL.dark, detail: t('Easy on the eyes at night') },
          ]}
          value={preference}
          onChange={onChange}
        />
        <View style={styles.preview} testID="appearance-preview">
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{t('How it looks')}</Text>
            <Text style={styles.previewBody}>{t('Text, cards and buttons all follow the theme.')}</Text>
            <View style={styles.previewButton}>
              <Text style={styles.previewButtonLabel}>{t('A button')}</Text>
            </View>
          </View>
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  preview: { padding: 16, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.hairline },
  previewCard: { padding: 16, borderRadius: 12, backgroundColor: colors.card, gap: 6 },
  previewTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  previewBody: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, lineHeight: 21 },
  previewButton: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.coral },
  previewButtonLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.onCoral },
}));
