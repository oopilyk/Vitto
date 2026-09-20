import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  PET_PERSONALITY_OPTIONS,
  assessCondition,
  bondFor,
  buildLifeContext,
  companion as ai,
  errorMessage,
  petVoice,
  type BodyProfile,
  type HealthEvent,
  type PetPersonality,
  type PetState,
} from '@vitto/core';
import { colors, fonts, layout } from '../theme';
import { companionService, type CompanionDebug } from '../services/companionService';

interface Props {
  pet: PetState;
  events: HealthEvent[];
  profile: BodyProfile;
  stepGoal: number;
  onChangePersonality: (next: PetPersonality) => void;
  onOpenChat: () => void;
  onClose: () => void;
}

/**
 * DEV ONLY. What the pet is about to be told, and how it would say it.
 *
 * Built around one rule: nothing on this screen spends money unless you press a
 * button that says it does. The prompt, the trigger the rules would fire, the
 * selected memories and the token counts all come from a `debug` call that never
 * reaches Claude, and the voice previews are pure functions running on the
 * phone. The expensive way to debug a prompt is to keep sending it.
 */
export function CompanionDebugScreen({ pet, events, profile, stepGoal, onChangePersonality, onOpenChat, onClose }: Props) {
  const [debug, setDebug] = useState<CompanionDebug | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const life = useMemo(() => buildLifeContext({ pet, events, profile, stepGoal }), [pet, events, profile, stepGoal]);
  const condition = useMemo(() => assessCondition(pet), [pet]);
  const bond = useMemo(() => bondFor(events, new Date(), { adoptedAt: pet.adoptedAt }), [events, pet.adoptedAt]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDebug(await companionService.debug(pet.id, life));
    } catch (cause) {
      setError(errorMessage(cause, 'Could not read the companion.'));
    }
  }, [pet.id, life]);

  useEffect(() => { void load(); }, [load]);

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause, `${label} failed.`));
    } finally {
      setBusy(null);
    }
  };

  // The same stock line under every temperament, side by side. Pure, instant,
  // free — and the fastest way to hear whether two of them sound alike.
  const sample = condition.primary ? 'I could really use something right now.' : 'I explored somewhere new today.';

  return (
    <View style={[layout.screen, styles.screen]}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Companion debug</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Reload" onPress={() => void load()} hitSlop={10}>
          <Text style={styles.reload}>↻</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Section label="TEMPERAMENT">
          <Text style={styles.note}>
            {`Switches ${pet.name} in place. Everything below updates; what the companion has already learned is kept.`}
          </Text>
          <View style={styles.chips}>
            {PET_PERSONALITY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                on={pet.personality === option.value}
                onPress={() => onChangePersonality(option.value)}
              />
            ))}
          </View>
          <Text style={styles.note}>Retired, still worn by older pets:</Text>
          <View style={styles.chips}>
            {(['energetic', 'chill', 'competitive', 'supportive'] as const).map((value) => (
              <Chip key={value} label={value} on={pet.personality === value} onPress={() => onChangePersonality(value)} />
            ))}
          </View>
        </Section>

        <Section label="VOICE, EVERY TEMPERAMENT (free, on device)">
          <Text style={styles.note}>{`"${sample}" — as each one would say it, with this pet's condition and bond applied.`}</Text>
          {PET_PERSONALITY_OPTIONS.map((option) => (
            <Row key={option.value} k={option.label}
              v={petVoice(sample, { personality: option.value, ailments: condition.ailments, bond: bond.stage })} />
          ))}
        </Section>

        <Section label="RIGHT NOW">
          <Row k="Condition" v={condition.ailments.length ? condition.ailments.join(', ') : 'well'} />
          <Row k="Bond" v={`${bond.stage} (${bond.score}/100, ${bond.silentDays}d silent)`} />
          <Row k="Level / build" v={`${life.pet.level} · ${life.pet.build}`} />
          <Row k="Streak" v={`${life.today.careStreakDays}d${life.today.loggedSomethingToday ? '' : ' (nothing today)'}`} />
        </Section>

        {debug === null && !error ? <ActivityIndicator color={colors.coral} style={{ marginTop: 24 }} /> : null}

        {debug ? (
          <>
            <Section label="COMPANION">
              <Row k="Model" v={debug.provider} />
              <Row k="Mood" v={`${debug.state.mood} ${debug.state.moodIntensity} — ${debug.state.moodReason}`} />
              <Row k="Relationship" v={`${debug.state.relationshipLevel} (${debug.state.relationshipScore})`} />
              <Row k="Affection / trust" v={`${debug.state.affection.toFixed(2)} / ${debug.state.trust.toFixed(2)}`} />
              <Row k="Nickname" v={debug.state.userNickname ?? '—'} />
              <Row k="Stored" v={`${debug.counts.memories} memories · ${debug.counts.events} events · ${debug.counts.messages} messages`} />
              <Row k="Today" v={`${debug.usage.sent} sent, ${debug.usage.proactive} unprompted · ${debug.access.messagesLeftToday} left (${debug.access.tier})`} />
            </Section>

            <Section label="TRAITS">
              {(Object.entries(debug.state.personalityTraits) as [string, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([trait, value]) => (
                  <View key={trait} style={styles.traitRow}>
                    <Text style={styles.traitName}>{trait}</Text>
                    <View style={styles.traitTrack}><View style={[styles.traitFill, { width: `${Math.round(value * 100)}%` }]} /></View>
                    <Text style={styles.traitValue}>{value.toFixed(2)}</Text>
                  </View>
                ))}
            </Section>

            <Section label="WHAT IT WOULD SAY UNPROMPTED">
              {debug.trigger ? (
                <>
                  <Row k="Trigger" v={`${debug.trigger.key} (priority ${debug.trigger.priority})`} />
                  <Text style={styles.mono}>{debug.trigger.situation}</Text>
                </>
              ) : (
                <Text style={styles.note}>No rule fires right now, so no model call would be made. This is the usual answer.</Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={busy !== null}
                onPress={() =>
                  void run('Speak now', async () => {
                    const { message, trigger } = await companionService.checkIn(pet.id, life);
                    setSpoken(message ? `[${trigger}] ${message.content}` : 'Nothing to say — no rule fired.');
                    await load();
                  })
                }
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionLabel}>{busy === 'Speak now' ? 'Asking…' : 'Speak now · costs one call'}</Text>
              </Pressable>
              {spoken ? <Text style={styles.spoken}>{spoken}</Text> : null}
            </Section>

            <Section label={`PROMPT · ${debug.tokens.stable} cached + ${debug.tokens.dynamic} dynamic + ${debug.tokens.history} history`}>
              <Text style={styles.note}>
                The cached block is identical for every user, so it is written once and read by everybody. If it ever drops below about 1,024 tokens it silently stops caching.
              </Text>
              {debug.voice ? <Text style={styles.mono}>{debug.voice}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => setShowPrompt((open) => !open)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <Text style={styles.actionLabel}>{showPrompt ? 'Hide the exact prompt' : 'Show the exact prompt'}</Text>
              </Pressable>
              {showPrompt ? <Text style={styles.prompt} selectable>{debug.prompt.dynamic}</Text> : null}
            </Section>

            <Section label={`MEMORIES · ${debug.counts.memories}`}>
              <Text style={styles.note}>Ticked are the ones selected for the next message.</Text>
              {debug.memories.length === 0 ? <Text style={styles.note}>Nothing learned yet.</Text> : null}
              {debug.memories.map((memory) => {
                const chosen = debug.selected.find((entry) => entry.id === memory.id);
                return (
                  <Text key={memory.id} style={[styles.mono, chosen && styles.monoOn]}>
                    {`${chosen ? '✓' : '·'} [${memory.category}] ${memory.content} — imp ${memory.importance.toFixed(2)}${chosen ? `, score ${chosen.score}` : ''}`}
                  </Text>
                );
              })}
            </Section>

            {debug.patterns.length ? (
              <Section label="HABITS NOTICED">
                {debug.patterns.map((pattern) => <Text key={pattern.key} style={styles.mono}>{`· ${pattern.description}`}</Text>)}
              </Section>
            ) : null}

            <Section label="RECENT EVENTS AS THE PET SEES THEM">
              {debug.recentEvents.length === 0 ? <Text style={styles.note}>Nothing recent.</Text> : null}
              {debug.recentEvents.map((event, index) => (
                <Text key={`${event.type}-${index}`} style={styles.mono}>
                  {`${event.ago}: ${event.type} ${JSON.stringify(event.metadata)}`}
                </Text>
              ))}
            </Section>

            <Section label="ACTIONS">
              <Pressable accessibilityRole="button" onPress={onOpenChat} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <Text style={styles.actionLabel}>Open the conversation</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy !== null}
                onPress={() =>
                  void run('Forget everything', async () => {
                    await companionService.reset(pet.id, life);
                    setSpoken(null);
                    await load();
                  })
                }
                style={({ pressed }) => [styles.action, styles.danger, pressed && styles.pressed]}
              >
                <Text style={[styles.actionLabel, styles.dangerLabel]}>
                  {busy === 'Forget everything' ? 'Forgetting…' : 'Forget everything · memories, mood, relationship'}
                </Text>
              </Pressable>
            </Section>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionLabel}>{label}</Text>
    {children}
  </View>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowKey}>{k}</Text>
    <Text style={styles.rowValue}>{v}</Text>
  </View>
);

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected: on }}
    onPress={onPress}
    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
  >
    <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 58, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { fontSize: 20, color: colors.coral },
  reload: { fontSize: 20, color: colors.coral },
  title: { fontFamily: fonts.mono, fontSize: 13, letterSpacing: 1, color: colors.ink, textTransform: 'uppercase' },
  body: { padding: 16, gap: 16, paddingBottom: 60 },
  section: { gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.1, color: colors.muted },
  note: { fontSize: 11, lineHeight: 16, color: colors.muted },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowKey: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, width: 104 },
  rowValue: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.hairline },
  chipOn: { borderColor: colors.coral, backgroundColor: colors.coralWash ?? 'rgba(216,93,69,0.12)' },
  chipLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft },
  chipLabelOn: { color: colors.coral, fontWeight: '700' },
  traitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  traitName: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkSoft, width: 86 },
  traitTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.hairline, overflow: 'hidden' },
  traitFill: { height: 5, borderRadius: 3, backgroundColor: colors.coral },
  traitValue: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, width: 34, textAlign: 'right' },
  mono: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 15, color: colors.inkSoft },
  monoOn: { color: colors.ink, fontWeight: '700' },
  prompt: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 13, color: colors.ink, backgroundColor: colors.paper, padding: 10, borderRadius: 8 },
  action: { paddingVertical: 10, alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.coral },
  actionLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral },
  danger: { borderColor: colors.danger },
  dangerLabel: { color: colors.danger },
  pressed: { opacity: 0.7 },
  spoken: { fontSize: 13, lineHeight: 19, color: colors.ink, fontStyle: 'italic' },
  error: { fontSize: 12, color: colors.danger },
});
