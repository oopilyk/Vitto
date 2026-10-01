import { Text, View } from 'react-native';
import { SettingsPage } from '../components/settingsKit';
import { PrimaryButton } from '../components/ui';
import { colors, themedStyles } from '../theme';

interface Props {
  status: 'disconnected' | 'connected';
  onConnect: () => void;
  onSync: () => void;
  syncing?: boolean;
  onClose: () => void;
}

/** Apple Health, on its own page (from Profile): connect once, then sync workouts and meals. */
export function AppleHealthScreen({ status, onConnect, onSync, syncing, onClose }: Props) {
  const connected = status === 'connected';
  return (
    <SettingsPage title="Apple Health" backLabel="Profile" onBack={onClose}>
      <View style={styles.status}>
        <Text style={styles.statusTitle}>{connected ? 'Connected' : 'Not connected'}</Text>
        <Text style={styles.statusBody}>
          {connected
            ? 'Workouts and meals from apps like Strong or MyFitnessPal show up here automatically. Sync to pull in the last two days now.'
            : "Connect to pull in workouts and meals you've already logged in Strong, MyFitnessPal, or similar apps."}
        </Text>
      </View>
      <View style={styles.actions}>
        {connected ? (
          <PrimaryButton label={syncing ? 'Syncing...' : 'Sync now'} busy={syncing} onPress={onSync} />
        ) : (
          <PrimaryButton label="Connect Apple Health" onPress={onConnect} />
        )}
      </View>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  status: { marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: colors.cardSoft, gap: 4 },
  statusTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  statusBody: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  actions: { marginTop: 20 },
}));
