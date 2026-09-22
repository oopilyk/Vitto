import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  PERSONA_MAX_LENGTH,
  companion,
  isValidPersona,
  petPersonalityOptionsFor,
  type PersonalityDials,
  type PetPersonality,
  type PetState,
} from '@vitto/core';
import { colors, fonts, layout } from '../theme';
import { CharacterDials } from './CharacterDials';
import { ChoiceRow } from './ui';

/** Everything that makes up the character, as one value to save together. */
export interface Character {
  personality: PetPersonality;
  dials: PersonalityDials;
  persona: string;
}

const same = (a: Character, b: Character): boolean =>
  a.personality === b.personality &&
  a.persona.trim() === b.persona.trim() &&
  companion.DIAL_KEYS.every((key) => Math.abs(a.dials[key] - b.dials[key]) < 1e-6);

export const characterOf = (pet: Pick<PetState, 'personality' | 'dials' | 'persona'>): Character => ({
  personality: pet.personality ?? 'sweet',
  dials: pet.dials ?? companion.dialsFor(pet.personality ?? 'sweet'),
  persona: pet.persona ?? '',
});

/**
 * Base → sliders → notes, then one save. The same editor everywhere a character
 * can be changed after adoption (Settings, the debug screen), so they cannot
 * drift apart.
 *
 * Saving is explicit rather than per-tap: every save re-seeds the companion's
 * traits on the server, and a slider being dragged through five stops should
 * not be five re-seeds.
 */
export function CharacterEditor({
  pet,
  age,
  onSave,
  saving,
}: {
  pet: Pick<PetState, 'name' | 'personality' | 'dials' | 'persona'>;
  /** Gates the notes field and the temperaments that swear (see MATURE_PERSONALITY_AGE). */
  age: number;
  onSave: (next: Character) => void;
  saving?: boolean;
}) {
  const stored = characterOf(pet);
  const [draft, setDraft] = useState<Character>(stored);
  // A save that lands (or a change from elsewhere) becomes the new baseline.
  useEffect(() => { setDraft(characterOf(pet)); }, [pet.personality, pet.dials, pet.persona]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = petPersonalityOptionsFor(age);
  const notesAllowed = options.some((option) => option.value === 'custom');
  const notesOk = draft.personality === 'custom' ? isValidPersona(draft.persona) : !draft.persona.trim() || isValidPersona(draft.persona);
  const savable = !saving && notesOk && !same(draft, stored);

  return (
    <View style={styles.wrap}>
      <ChoiceRow
        stacked
        options={options}
        value={options.some((option) => option.value === draft.personality) ? draft.personality : undefined}
        onChange={(personality) =>
          // A new base moves the sliders to where that base sits.
          setDraft((current) => ({ ...current, personality, dials: companion.dialsFor(personality) }))
        }
      />
      <Text style={styles.label}>Fine-tune</Text>
      <CharacterDials dials={draft.dials} onChange={(dials) => setDraft((current) => ({ ...current, dials }))} testID="character-dials" />
      {notesAllowed ? (
        <View>
          <Text style={styles.label}>
            {draft.personality === 'custom' ? 'Who are they?' : `Anything else ${pet.name} should know about how you want them to act?`}
          </Text>
          <TextInput
            style={[layout.input, styles.persona]}
            value={draft.persona}
            onChangeText={(persona) => setDraft((current) => ({ ...current, persona: persona.slice(0, PERSONA_MAX_LENGTH) }))}
            placeholder={draft.personality === 'custom' ? 'A grumpy old pirate who secretly adores us.' : 'Optional. "Calls me chief. Never impressed by anything."'}
            placeholderTextColor={colors.faint}
            multiline
            maxLength={PERSONA_MAX_LENGTH}
            accessibilityLabel="Their character"
          />
          <Text style={styles.count}>{`${draft.persona.length} / ${PERSONA_MAX_LENGTH}`}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !savable }}
        disabled={!savable}
        onPress={() => onSave({ ...draft, persona: draft.persona.trim() })}
        style={({ pressed }) => [styles.save, !savable && styles.saveOff, pressed && styles.pressed]}
      >
        <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save character'}</Text>
      </Pressable>
      <Text style={styles.note}>What they have learned about you is kept. Only the starting point moves.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { fontSize: 12, fontWeight: '600', color: colors.inkSoft, marginTop: 6 },
  persona: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top', lineHeight: 19, marginTop: 6 },
  count: { fontSize: 11, color: colors.faint, textAlign: 'right', marginTop: 4 },
  save: { marginTop: 6, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: colors.coral },
  saveOff: { opacity: 0.35 },
  saveLabel: { fontFamily: fonts.mono, fontSize: 13, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.8 },
  note: { fontSize: 11, lineHeight: 16, color: colors.muted },
});
