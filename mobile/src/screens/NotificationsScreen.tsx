import { View } from 'react-native';
import { SettingsPage, ToggleRow } from '../components/settingsKit';
import { themedStyles } from '../theme';
import { t } from '../i18n';

interface Props {
  petName?: string;
  /** Whether this device hears from the pet. Null where push cannot work. */
  pushEnabled?: boolean | null;
  onPushEnabledChange?: (next: boolean) => void;
  /** Whether the pet shows in the Dynamic Island. Null where the device cannot. */
  islandEnabled?: boolean | null;
  onIslandEnabledChange?: (next: boolean) => void;
  /** Kind words from the pet every couple of days. Null where notifications cannot work. */
  affirmationsEnabled?: boolean | null;
  onAffirmationsEnabledChange?: (next: boolean) => void;
  onClose: () => void;
}

/** Notifications, on their own page (from Settings). Each toggle shows only where it can work. */
export function NotificationsScreen({
  petName,
  pushEnabled,
  onPushEnabledChange,
  islandEnabled,
  onIslandEnabledChange,
  affirmationsEnabled,
  onAffirmationsEnabledChange,
  onClose,
}: Props) {
  return (
    <SettingsPage title={t('Notifications')} backLabel={t('Settings')} onBack={onClose}>
      <View style={styles.body}>
        {typeof pushEnabled === 'boolean' && onPushEnabledChange ? (
          <ToggleRow
            title={petName ? t('{pet} can message you', { pet: petName }) : t('Your pet can message you')}
            description={t('Never between 10pm and 8am.')}
            value={pushEnabled}
            onChange={onPushEnabledChange}
          />
        ) : null}
        {typeof affirmationsEnabled === 'boolean' && onAffirmationsEnabledChange ? (
          <ToggleRow
            title={t('Little affirmations')}
            description={
              petName
                ? t('Every couple of days, a kind word from {pet}. Daytime only.', { pet: petName })
                : t('Every couple of days, a kind word from your pet. Daytime only.')
            }
            value={affirmationsEnabled}
            onChange={onAffirmationsEnabledChange}
          />
        ) : null}
        {typeof islandEnabled === 'boolean' && onIslandEnabledChange ? (
          <ToggleRow
            title={t('Dynamic Island')}
            description={t('How hungry and sleepy they are, live, and how long until they need you.')}
            value={islandEnabled}
            onChange={onIslandEnabledChange}
          />
        ) : null}
      </View>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  body: { marginTop: 16, gap: 16 },
}));
