import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  PERSONALITY_PREVIEW,
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
  changesLeft,
}: {
  pet: Pick<PetState, 'name' | 'personality' | 'dials' | 'persona'>;
  /** Gates the notes field and the temperaments that swear (see MATURE_PERSONALITY_AGE). */
  age: number;
  /** Resolves to null once the character is confirmed in place, or to what went wrong. */
  onSave: (next: Character) => Promise<string | null> | void;
  saving?: boolean;
  /**
   * Character changes left this month (the server caps them; see the
   * personality_change_limit migration). Null or absent: no limit shown.
   */
  changesLeft?: number | null;
}) {
  const stored = characterOf(pet);
  const [draft, setDraft] = useState<Character>(stored);
  // A save that lands (or a change from elsewhere) becomes the new baseline.
  useEffect(() => { setDraft(characterOf(pet)); }, [pet.personality, pet.dials, pet.persona]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = petPersonalityOptionsFor(age);
  const notesAllowed = options.some((option) => option.value === 'custom');
  const notesOk = draft.personality === 'custom' ? isValidPersona(draft.persona) : !draft.persona.trim() || isValidPersona(draft.persona);
  const outOfChanges = changesLeft === 0;
  // Where the last save got to: under way, confirmed on the server, or refused.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const busy = saving || saveState === 'saving';
  const savable = !busy && notesOk && !same(draft, stored) && !outOfChanges;
  // An edit after a save starts a new one.
  useEffect(() => {
    if (saveState === 'saved' && !same(draft, stored)) setSaveState('idle');
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    Keyboard.dismiss();
    setSaveState('saving');
    setSaveError(null);
    const problem = await onSave({ ...draft, persona: draft.persona.trim() });
    if (typeof problem === 'string') {
      setSaveState('failed');
      setSaveError(problem);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setSaveState('saved');
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  const justSaved = saveState === 'saved' && same(draft, stored);

  return (
    <View style={styles.wrap}>
      <CurrentCharacter
        pet={pet}
        label={options.find((option) => option.value === stored.personality)?.label ?? 'Default'}
        dials={stored.dials}
        confirmed={justSaved}
      />
      <ChoiceRow
        stacked
        options={options}
        value={options.some((option) => option.value === draft.personality) ? draft.personality : undefined}
        onChange={(personality) =>
          // A new base moves the sliders to where that base sits. The notes are
          // kept (only shown, and only sent to the companion, on "Your own"), so
          // trying another base and coming back does not lose what was written.
          setDraft((current) => ({ ...current, personality, dials: companion.dialsFor(personality) }))
        }
        // The fine-tuning drops down under the base it tunes.
        expanded={(personality) => (
          <>
            <PersonalityPreview
              personality={personality}
              dials={draft.dials}
              persona={draft.persona}
              name={pet.name}
            />
            <Text style={styles.label}>Fine-tune</Text>
            <CharacterDials dials={draft.dials} onChange={(dials) => setDraft((current) => ({ ...current, dials }))} testID="character-dials" />
            {notesAllowed && personality === 'custom' ? (
              <View>
                <Text style={styles.label}>Who are they?</Text>
                <TextInput
                  style={[layout.input, styles.persona]}
                  value={draft.persona}
                  onChangeText={(persona) => setDraft((current) => ({ ...current, persona: persona.slice(0, PERSONA_MAX_LENGTH) }))}
                  placeholder="A grumpy old pirate who secretly adores us."
                  placeholderTextColor={colors.faint}
                  multiline
                  // Return closes the keyboard rather than starting a new line.
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  maxLength={PERSONA_MAX_LENGTH}
                  accessibilityLabel="Their character"
                />
                <Text style={styles.count}>{`${draft.persona.length} / ${PERSONA_MAX_LENGTH}`}</Text>
              </View>
            ) : null}
          </>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !savable }}
        disabled={!savable}
        onPress={() => void save()}
        style={({ pressed }) => [
          styles.save,
          justSaved ? styles.saveDone : !savable && styles.saveOff,
          pressed && styles.pressed,
        ]}
        testID="save-character"
      >
        <Text style={styles.saveLabel}>{busy ? 'Saving…' : justSaved ? '✓ Saved' : 'Save character'}</Text>
      </Pressable>
      {justSaved ? (
        <View style={styles.savedBanner} testID="character-saved">
          <Text style={styles.savedBannerMark}>✓</Text>
          <View style={styles.savedBannerText}>
            <Text style={styles.savedBannerTitle}>Saved and in place</Text>
            <Text style={styles.savedBannerBody}>{`Checked on the server. ${pet.name} talks this way from their next message.`}</Text>
          </View>
        </View>
      ) : null}
      {saveState === 'failed' && saveError ? (
        <View style={styles.failed} testID="character-save-failed">
          <Text style={styles.failedTitle}>Not saved</Text>
          <Text style={styles.failedBody}>{saveError}</Text>
        </View>
      ) : null}
      {typeof changesLeft === 'number' ? (
        <Text style={[styles.note, outOfChanges && styles.noteOut]} testID="changes-left">
          {outOfChanges
            ? 'No character changes left this month. They reset on the 1st.'
            : `${changesLeft} character change${changesLeft === 1 ? '' : 's'} left this month.`}
        </Text>
      ) : null}
      <Text style={styles.note}>What they have learned about you is kept. Only the starting point moves.</Text>
    </View>
  );
}

/**
 * What is live right now, read off the stored pet -- not the draft. After a
 * confirmed save it turns green and says so.
 */
function CurrentCharacter({
  pet,
  label,
  dials,
  confirmed,
}: {
  pet: Pick<PetState, 'name' | 'personality' | 'persona'>;
  label: string;
  dials: PersonalityDials;
  confirmed: boolean;
}) {
  const tuned = companion.describeDials(dials);
  const notes = pet.personality === 'custom' ? pet.persona?.trim() : undefined;
  return (
    <View style={[styles.current, confirmed && styles.currentConfirmed]} testID="current-character">
      <Text style={[styles.currentKicker, confirmed && styles.currentKickerConfirmed]}>
        {confirmed ? '✓ Live now' : 'Current character'}
      </Text>
      <Text style={styles.currentName}>{`${pet.name} is ${label}`}</Text>
      {notes ? <Text style={styles.currentNotes} numberOfLines={2}>{`"${notes}"`}</Text> : null}
      {tuned ? <Text style={styles.currentTuned}>{`Tuned: ${tuned}.`}</Text> : null}
    </View>
  );
}

/**
 * What the chosen personality is like, said before it is saved: a description,
 * a line in its voice (or, for "Your own", their own notes), and where the
 * sliders have moved it.
 */
export function PersonalityPreview({ personality, dials, persona, name }: { personality: PetPersonality; dials: PersonalityDials; persona: string; name: string }) {
  const preview = PERSONALITY_PREVIEW[personality];
  if (!preview) return null;
  const quote = personality === 'custom' ? persona.trim() : preview.sample;
  const tuned = companion.describeDials(dials);
  return (
    <View style={styles.preview} testID="personality-preview">
      <Text style={styles.previewAbout}>{preview.about}</Text>
      {quote ? (
        <View style={styles.previewQuote}>
          <Text style={styles.previewQuoteText}>{personality === 'custom' ? quote : `"${quote}"`}</Text>
          <Text style={styles.previewQuoteBy}>{personality === 'custom' ? 'Your notes' : `${name}, probably`}</Text>
        </View>
      ) : null}
      <Text style={styles.previewTuned}>{tuned ? `Tuned: ${tuned}.` : 'Tuned: right where this personality sits.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  preview: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  previewAbout: { fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
  previewQuote: { borderLeftWidth: 3, borderLeftColor: colors.coral, paddingLeft: 10, gap: 2 },
  previewQuoteText: { fontSize: 14, color: colors.ink, fontStyle: 'italic', lineHeight: 20 },
  previewQuoteBy: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint },
  previewTuned: { fontSize: 12, color: colors.muted },
  current: {
    gap: 3,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  currentConfirmed: { borderColor: colors.mintDeep, backgroundColor: colors.mint },
  currentKicker: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  currentKickerConfirmed: { color: colors.mintDeep, fontWeight: '700' },
  currentName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  currentNotes: { fontSize: 13, fontStyle: 'italic', color: colors.inkSoft },
  currentTuned: { fontSize: 12, color: colors.muted },
  saveDone: { backgroundColor: colors.mintDeep },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.mintDeep,
  },
  savedBannerMark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    color: colors.mintDeep,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 30,
    overflow: 'hidden',
  },
  savedBannerText: { flex: 1 },
  savedBannerTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  savedBannerBody: { fontSize: 12, color: '#e6f2e8', lineHeight: 17, marginTop: 1 },
  failed: { gap: 2, padding: 10, borderRadius: 10, backgroundColor: colors.coralWash },
  failedTitle: { fontSize: 13, fontWeight: '700', color: colors.coralDeep },
  failedBody: { fontSize: 12, color: colors.coralDeep, lineHeight: 17 },
  noteOut: { color: colors.coral },
  label: { fontSize: 12, fontWeight: '600', color: colors.inkSoft, marginTop: 6 },
  persona: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top', lineHeight: 19, marginTop: 6 },
  count: { fontSize: 11, color: colors.faint, textAlign: 'right', marginTop: 4 },
  save: { marginTop: 6, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: colors.coral },
  saveOff: { opacity: 0.35 },
  saveLabel: { fontFamily: fonts.mono, fontSize: 13, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.8 },
  note: { fontSize: 11, lineHeight: 16, color: colors.muted },
});
