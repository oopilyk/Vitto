import { StyleSheet, Text, View } from 'react-native';
import type { PetState } from '@vitto/core';
import { CharacterEditor, type Character } from '../components/CharacterEditor';
import { SettingsPage } from '../components/settingsKit';
import { TextButton } from '../components/ui';
import { colors } from '../theme';

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
  onClose: () => void;
}

/** The pet's personality, on its own page (from Settings). */
export function PersonalityScreen({ pet, age, onSave, canCustomise = true, onOpenPlus, changesLeft, onClose }: Props) {
  return (
    <SettingsPage
      title="Personality"
      lead={`How ${pet.name} talks to you. Your notes and history are kept when you change it.`}
      backLabel="Settings"
      onBack={onClose}
    >
      <View style={styles.body}>
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

const styles = StyleSheet.create({
  body: { marginTop: 16 },
  locked: {
    gap: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.cardSoft,
  },
  lockedTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  lockedBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
});
