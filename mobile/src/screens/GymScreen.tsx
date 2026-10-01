import { StyleSheet, Text, View } from 'react-native';
import { SettingsPage } from '../components/settingsKit';
import { PrimaryButton, TextButton } from '../components/ui';
import { colors, text } from '../theme';

export interface GymProps {
  saved: boolean;
  busy: boolean;
  error: string | null;
  onSetHere: () => void;
  onClear: () => void;
}

/**
 * "My gym", on its own page (from Profile): one coordinate, kept on this
 * device, that parks a dumbbell beside the pet whenever the app is open nearby.
 * See mobile/AMBIENT.md.
 */
export function GymScreen({ gym, onClose }: { gym: GymProps; onClose: () => void }) {
  return (
    <SettingsPage
      title="My gym"
      lead="Save where you train and your pet picks up a dumbbell whenever you open Vitto there."
      backLabel="Profile"
      onBack={onClose}
    >
      <View style={styles.status} testID="gym-status">
        <Text style={styles.statusTitle}>{gym.saved ? 'Saved' : 'Not set'}</Text>
        <Text style={styles.statusBody}>
          {gym.saved
            ? 'Vitto checks whether you are nearby while the app is open. Nothing is recorded.'
            : 'Stand at your gym and save it. Only that one spot is kept, on this phone.'}
        </Text>
      </View>
      {gym.error ? <Text style={styles.error}>{gym.error}</Text> : null}
      <View style={styles.actions}>
        <PrimaryButton
          label={gym.busy ? 'Finding you...' : gym.saved ? 'Move my gym to here' : 'Set my gym to here'}
          busy={gym.busy}
          onPress={gym.onSetHere}
        />
        {gym.saved ? <TextButton label="Forget my gym" onPress={gym.onClear} disabled={gym.busy} /> : null}
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  status: { marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: colors.cardSoft, gap: 4 },
  statusTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  statusBody: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  actions: { marginTop: 20, gap: 8, alignItems: 'stretch' },
  error: { ...text.error, fontSize: 13, marginTop: 12 },
});
