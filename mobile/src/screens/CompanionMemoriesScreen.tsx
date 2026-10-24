import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { companion as ai, errorMessage } from '@vitto/core';
import { DangerButton, DangerZone, SettingsPage, kit } from '../components/settingsKit';
import { companionService, type CompanionMemory } from '../services/companionService';
import { text } from '../theme';

interface Props {
  petId: string;
  petName: string;
  /** Asks before something is deleted; resolves true to go ahead. App's `confirmDialog`. */
  confirm: (title: string, message: string, confirmLabel: string) => Promise<boolean>;
  onClose: () => void;
}

/** What kind of thing each memory is, in plain words, under the memory itself. */
const CATEGORY_LABEL: Record<ai.MemoryCategory, string> = {
  preference: 'Likes and dislikes',
  goal: 'A goal',
  routine: 'Your routine',
  activity: 'Something you did',
  relationship: 'People in your life',
  importantEvent: 'Coming up',
  healthHabit: 'A health habit',
  conversationFact: 'Something you said',
};

/**
 * What the pet remembers about you (from Settings), and forgetting it.
 *
 * Read and deleted through the companion function, never the table: the
 * memories have no client write policy, and deleting one also redoes the
 * pet's sense of how well it knows you. Forgetting removes the row for good.
 */
export function CompanionMemoriesScreen({ petId, petName, confirm, onClose }: Props) {
  const [memories, setMemories] = useState<CompanionMemory[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    companionService
      .memories(petId)
      .then((loaded) => !cancelled && setMemories(loaded))
      .catch((cause) => !cancelled && setError(errorMessage(cause, `Could not reach ${petName}.`)));
    return () => {
      cancelled = true;
    };
  }, [petId, petName]);

  const forgetOne = async (memory: CompanionMemory) => {
    if (busy || !(await confirm('Forget this?', `${petName} won't remember "${memory.content}".`, 'Forget'))) return;
    setBusy(true);
    try {
      await companionService.forgetMemory(petId, memory.id);
      setMemories((current) => current?.filter((m) => m.id !== memory.id) ?? null);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not forget that. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const forgetAll = async () => {
    const sure = await confirm(
      'Forget everything?',
      `${petName} will forget everything it has learned about you. Your chat and your pet stay. This cannot be undone.`,
      'Forget everything',
    );
    if (!sure) return;
    setBusy(true);
    try {
      await companionService.forgetAllMemories(petId);
      setMemories([]);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not forget. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage
      title={`What ${petName} remembers`}
      lead={`Things you've told ${petName} in chat that it keeps in mind. Tap one to make ${petName} forget it.`}
      backLabel="Settings"
      onBack={onClose}
    >
      <View style={kit.sectionBody}>
        {error ? <Text style={text.error}>{error}</Text> : null}
        {memories === null ? (
          error ? null : <Text style={kit.sectionDescription}>Loading...</Text>
        ) : memories.length === 0 ? (
          <Text style={kit.sectionDescription} testID="memories-empty">
            {`${petName} doesn't remember anything about you yet. Chat a little and it'll start to learn what matters to you.`}
          </Text>
        ) : (
          <View style={kit.list}>
            {memories.map((memory, index) => (
              <Pressable
                key={memory.id}
                accessibilityRole="button"
                accessibilityLabel={`Forget: ${memory.content}`}
                accessibilityHint="Asks before forgetting"
                onPress={() => void forgetOne(memory)}
                disabled={busy}
                style={({ pressed }) => [kit.row, index > 0 && kit.rowRuled, pressed && kit.navRowPressed]}
                testID={`memory-${memory.id}`}
              >
                <View style={kit.rowText}>
                  <Text style={kit.rowLabel}>{memory.content}</Text>
                  <Text style={kit.rowDetail}>{CATEGORY_LABEL[memory.category] ?? 'Something you said'}</Text>
                </View>
                <Text style={kit.navChevron}>×</Text>
              </Pressable>
            ))}
          </View>
        )}
        {memories && memories.length > 0 ? (
          <DangerZone
            title="Forget everything"
            description={`Deletes everything ${petName} has learned about you. Your chat history, your pet and how close you are stay as they are.`}
          >
            <DangerButton label={busy ? 'Forgetting...' : 'Forget everything'} disabled={busy} onPress={() => void forgetAll()} />
          </DangerZone>
        ) : null}
      </View>
    </SettingsPage>
  );
}
