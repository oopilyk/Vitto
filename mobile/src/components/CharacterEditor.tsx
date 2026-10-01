import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
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
import { colors, fonts, themedStyles } from '../theme';
import { CharacterDials } from './CharacterDials';
import { SelectionList, TextField } from './settingsKit';

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
      <SelectionList
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
                <TextField
                  style={styles.persona}
                  value={draft.persona}
                  onChangeText={(persona) => setDraft((current) => ({ ...current, persona: persona.slice(0, PERSONA_MAX_LENGTH) }))}
                  placeholder="A grumpy old pirate who secretly adores us."
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
        <Text style={[styles.saveLabel, !justSaved && !busy && !savable && styles.saveLabelOff]}>
          {busy ? 'Saving…' : justSaved ? '✓ Saved' : 'Save character'}
        </Text>
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
        {confirmed ? '✓ Live now' : 'Current voice'}
      </Text>
      <Text style={styles.currentName}>{pet.personality === 'custom' ? `${pet.name} is their own character` : `${pet.name} is ${label}`}</Text>
      {notes ? <Text style={styles.currentNotes} numberOfLines={3}>{`“${notes}”`}</Text> : null}
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

const styles = themedStyles(() => ({
  wrap: { gap: 14 },
  preview: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.card },
  previewAbout: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  previewQuote: { borderLeftWidth: 3, borderLeftColor: colors.coral, paddingLeft: 12, gap: 4 },
  previewQuoteText: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, fontStyle: 'italic', lineHeight: 24 },
  previewQuoteBy: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  previewTuned: { fontSize: 13, color: colors.muted },
  current: { gap: 4, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: colors.cardSoft },
  currentConfirmed: { borderColor: colors.mintDeep, backgroundColor: colors.mint },
  currentKicker: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.faint },
  currentKickerConfirmed: { color: colors.mintDeep, fontWeight: '700' },
  currentName: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  currentNotes: { fontFamily: fonts.display, fontSize: 19, fontStyle: 'italic', color: colors.coralDeep, lineHeight: 26, marginTop: 2 },
  currentTuned: { fontSize: 13, color: colors.muted, marginTop: 2 },
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
  label: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  persona: { minHeight: 96, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top', lineHeight: 21, marginTop: 8 },
  count: { fontSize: 11, color: colors.faint, textAlign: 'right', marginTop: 4 },
  save: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.coral },
  saveOff: { backgroundColor: colors.disabledFill },
  saveLabel: { fontSize: 16, fontWeight: '700', color: colors.onCoral },
  saveLabelOff: { color: colors.onDisabled },
  pressed: { opacity: 0.8 },
  note: { fontSize: 13, lineHeight: 18, color: colors.muted },
}));
