import { Text, View } from 'react-native';
import type { PetState } from '@vitto/core';
import { CharacterEditor, type Character } from '../components/CharacterEditor';
import { SettingsPage } from '../components/settingsKit';
import { TextButton } from '../components/ui';
import { colors, themedStyles } from '../theme';

interface Props {
  pet: Pick<PetState, 'name' | 'personality' | 'dials' | 'persona'>;
  /** For the temperaments that need an age behind them. */
  age: number;
  /** Saves base, sliders and notes together; resolves to null once confirmed in place, or to what went wrong. */
  onSave: (next: Character) => Promise<string | null> | void;
  /** Personalities are Plus. False shows what the feature is instead of the editor. Defaults to true. */
  canCustomise?: boolean;
  /** Opens the Plus screen, from the locked note. */
  onOpenPlus?: () => void;
  /** Character changes left this month; null or absent for no limit. */
  changesLeft?: number | null;
  /** Arrived straight from buying Plus: says so, and invites a first choice. */
  welcome?: boolean;
  onClose: () => void;
}

/** The pet's personality, on its own page (from Settings). */
export function PersonalityScreen({ pet, age, onSave, canCustomise = true, onOpenPlus, changesLeft, welcome = false, onClose }: Props) {
  return (
    <SettingsPage
      title={welcome ? `Who should ${pet.name} be?` : 'Personality'}
      lead={
        welcome
          ? `Plus unlocks ${pet.name}'s personality. Pick one, tune it, or write your own. You can change it later in Settings.`
          : `How ${pet.name} talks to you. Your notes and history are kept when you change it.`
      }
      backLabel={welcome ? 'Later' : 'Settings'}
      onBack={onClose}
    >
      <View style={styles.body}>
        {welcome ? (
          <View style={styles.welcome} testID="plus-welcome">
            <Text style={styles.welcomeTitle}>Welcome to Plus</Text>
            <Text style={styles.welcomeBody}>{`Until now ${pet.name} has had the default voice. This is where they become yours.`}</Text>
          </View>
        ) : null}
        {canCustomise ? (
          <CharacterEditor pet={pet} age={age} onSave={onSave} changesLeft={changesLeft} />
        ) : (
          <View style={styles.locked} testID="personality-locked">
            <Text style={styles.lockedTitle}>A Plus feature</Text>
            <Text style={styles.lockedBody}>
              {`${pet.name} talks in their own easygoing voice. With Plus you can pick a temperament, fine-tune it, or write them a whole character.`}
            </Text>
            {onOpenPlus ? <TextButton label="See Plus" tone="coral" onPress={onOpenPlus} /> : null}
          </View>
        )}
      </View>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  body: { marginTop: 16 },
  welcome: { gap: 4, padding: 16, marginBottom: 16, borderRadius: 16, backgroundColor: colors.coralWash },
  welcomeTitle: { fontSize: 16, fontWeight: '700', color: colors.coralDeep },
  welcomeBody: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  locked: {
    gap: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.cardSoft,
  },
  lockedTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  lockedBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
}));
