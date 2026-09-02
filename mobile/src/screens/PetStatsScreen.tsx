import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type BrainTrainingMetadata,
  EVOLUTION_STAGE_LABEL,
  type HealthEvent,
  PET_STAT_DESCRIPTORS,
  type PetStatGroup,
  type PetState,
  applyTimeDecay,
  calculateStreaks,
  careCountsByType,
  daysWithPet,
  findWordPuzzleEventForDate,
  getActiveDateKeys,
  getEvolutionStage,
  wordPuzzleStreak,
  isSameDay,
  mindScoreLabel,
  statValue,
  toDateKey,
} from '@vitto/core';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { SpriteFrame } from '../components/SpriteFrame';
import { StatBar } from '../components/StatBar';
import { sheetForPet } from '../components/petSprites';
import { Kicker } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  pet: PetState;
  events: HealthEvent[];
  onClose: () => void;
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/** One colour per group, so a bar's tint says which part of the pet it belongs to. */
const GROUP_COLOR: Record<PetStatGroup, string> = {
  condition: colors.coral,
  body: colors.mintDeep,
  mind: colors.lilacDeep,
};

const SPECIES_LABEL: Record<PetState['species'], string> = {
  cat: 'Cat',
  dog: 'Dog',
  bunny: 'Bunny',
};

const CARE_LABEL = [
  ['MEAL', 'Meals'],
  ['WORKOUT', 'Workouts'],
  ['STEP_ACTIVITY', 'Step days'],
  ['BRAIN_TRAINING', 'Mind sessions'],
] as const;

/** The per-day pull on the needs-based stats, mirroring `applyTimeDecay`. */
const DECAY_RATES = 'Energy −4 · Nutrition −6 · Happiness −3 · Mind −2, every day without care.';

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Kicker>{title}</Kicker>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

/**
 * Which brain sessions count toward a given day. The timed games are stamped the
 * moment they finish, so their completion time is their day. WordPuzzle fixes its day
 * when the board opens, so it is keyed on `puzzleDate` instead — a puzzle carried
 * past midnight still belongs to the day it was set for.
 */
const mindEventsForDay = (
  events: HealthEvent[],
  day: Date,
): HealthEvent<BrainTrainingMetadata>[] => {
  const dayKey = toDateKey(day);
  return events.filter((event): event is HealthEvent<BrainTrainingMetadata> => {
    if (event.type !== 'BRAIN_TRAINING') return false;
    const { puzzleDate } = event.metadata as BrainTrainingMetadata;
    return puzzleDate ? puzzleDate === dayKey : isSameDay(event.occurredAt, day);
  });
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const describeMood = (pet: PetState): string => {
  if (pet.mood === 'hungry') return `Nutrition is under 35, so ${pet.name} is hungry.`;
  if (pet.mood === 'sleepy') return `Energy is under 40, so ${pet.name} is sleepy.`;
  if (pet.mood === 'bright') return `Energy and happiness are both 65 or more — ${pet.name} is bright.`;
  return `Fed and rested, but not yet at 65 energy and happiness together.`;
};

export function PetStatsScreen({ pet, events, onClose }: Props) {
  const now = new Date();
  // Shown, never saved: `applyTimeDecay` leaves `lastEventAt` alone, so persisting
  // it would decay the same stretch of time again on the next care moment.
  const shown = applyTimeDecay(pet, now);
  const sheet = sheetForPet(pet);
  const stage = getEvolutionStage(pet.level);
  const streaks = calculateStreaks(events, now);
  const last7 = careCountsByType(events, 7, now);
  const last30 = careCountsByType(events, 30, now);

  const todaysMind = mindEventsForDay(events, now);
  const bestMindScore = todaysMind.reduce((best, event) => Math.max(best, event.metadata.score), 0);

  const todaysWordPuzzle = findWordPuzzleEventForDate(events, toDateKey(now));
  const wordPuzzleDays = wordPuzzleStreak(events, now);

  const lastEventAt = pet.lastEventAt ? new Date(pet.lastEventAt) : null;
  const daysSinceCare = lastEventAt
    ? Math.max(0, Math.floor((now.getTime() - lastEventAt.getTime()) / 86400000))
    : null;

  const groupOf = (group: PetStatGroup) =>
    PET_STAT_DESCRIPTORS.filter((descriptor) => descriptor.group === group);

  const renderGroup = (group: PetStatGroup) =>
    groupOf(group).map((descriptor) => (
      <StatBar
        key={descriptor.key}
        label={descriptor.label}
        value={statValue(shown, descriptor.key)}
        color={GROUP_COLOR[group]}
        hint={descriptor.hint}
      />
    ));

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to your pet"
          onPress={onClose}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Pet</Text>
        </Pressable>
        <Text style={styles.topTitle}>Stats</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}>
        <View style={styles.identity}>
          <View style={styles.portrait}>
            <SpriteFrame sheet={sheet} frame={sheet.animations.idle[0]} size={96} />
          </View>
          <View style={styles.identityText}>
            <Kicker>{EVOLUTION_STAGE_LABEL[stage].toUpperCase()}</Kicker>
            <Text style={styles.petName}>{pet.name}</Text>
            <Text style={styles.identityMeta}>
              {sheet.label} · {SPECIES_LABEL[pet.species]}
            </Text>
            <Text style={styles.identityMeta}>
              Day {daysWithPet(pet, now)} together
            </Text>
          </View>
        </View>

        <Card title="Level & XP" hint={`100 XP carries ${pet.name} to the next level.`}>
          <View style={styles.facts}>
            <Fact label="level" value={String(pet.level)} />
            <Fact label="XP this level" value={`${pet.xp}/100`} />
            <Fact label="stage" value={EVOLUTION_STAGE_LABEL[stage]} />
          </View>
          <StatBar label="XP" value={pet.xp} color={colors.coral} />
          <View style={styles.moodRow}>
            <Text style={styles.moodValue}>Feeling {shown.mood}</Text>
            <Text style={styles.moodHint}>{describeMood(shown)}</Text>
          </View>
        </Card>

        <Card
          title="Condition"
          hint={`How ${pet.name} is doing right now. These fade on their own — everything else only ever climbs.`}
        >
          {renderGroup('condition')}
        </Card>

        <Card title="Body" hint="Built up through training, and it stays built.">
          {renderGroup('body')}
        </Card>

        <Card title="Mind">
          {renderGroup('mind')}
          <View style={styles.moodRow}>
            <Text style={styles.moodValue}>
              Today's best mind score: {bestMindScore || '—'}
            </Text>
            <Text style={styles.moodHint}>
              {todaysMind.length
                ? `${mindScoreLabel(bestMindScore)} · ${todaysMind.length} session${todaysMind.length > 1 ? 's' : ''} today.`
                : `${mindScoreLabel(0)} — no mind session logged today.`}
            </Text>
          </View>
          <View style={styles.moodRow}>
            <Text style={styles.moodValue}>
              Today's word puzzle: {todaysWordPuzzle ? todaysWordPuzzle.metadata.score : 'not played yet'}
            </Text>
            <Text style={styles.moodHint}>
              {todaysWordPuzzle
                ? `${todaysWordPuzzle.metadata.correct}/${todaysWordPuzzle.metadata.total} rounds solved.`
                : `Five rounds, once a day — ${pet.name} is waiting on today's board.`}
            </Text>
            <View style={styles.facts}>
              <Fact label="word puzzle streak" value={String(wordPuzzleDays.currentStreak)} />
              <Fact label="longest word puzzle run" value={String(wordPuzzleDays.longestStreak)} />
            </View>
          </View>
        </Card>

        <Card title="Consistency" hint="Every day you logged something.">
          <View style={styles.facts}>
            <Fact label="day streak" value={String(streaks.currentStreak)} />
            <Fact label="longest run" value={String(streaks.longestStreak)} />
            <Fact label="care moments" value={String(events.length)} />
          </View>
          <ActivityCalendar activeDateKeys={getActiveDateKeys(events)} />
        </Card>

        <Card title="Care breakdown" hint="What you have logged recently.">
          <View style={styles.tableHead}>
            <Text style={[styles.tableLabel, styles.tableLabelHead]}>Type</Text>
            <Text style={styles.tableCount}>7d</Text>
            <Text style={styles.tableCount}>30d</Text>
          </View>
          {CARE_LABEL.map(([type, label]) => (
            <View key={type} style={styles.tableRow}>
              <Text style={styles.tableLabel}>{label}</Text>
              <Text style={styles.tableValue}>{last7[type]}</Text>
              <Text style={styles.tableValue}>{last30[type]}</Text>
            </View>
          ))}
          <Text style={styles.lastCare}>
            {lastEventAt
              ? `Last cared for ${daysSinceCare === 0 ? 'today' : daysSinceCare === 1 ? 'yesterday' : `${daysSinceCare} days ago`} · ${lastEventAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
              : `${pet.name} has not been cared for yet.`}
          </Text>
          <Text style={styles.decayNote}>{DECAY_RATES}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  topTitle: { ...text.heading, fontSize: 16 },
  body: { padding: 16, gap: 14 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 2, paddingTop: 6 },
  portrait: {
    width: 96,
    height: 96,
    borderRadius: 20,
    backgroundColor: colors.sageSoft,
    overflow: 'hidden',
  },
  identityText: { flex: 1, minWidth: 0 },
  petName: { ...text.title, marginTop: 6 },
  identityMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 5 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
  },
  cardHint: { fontSize: 12, color: colors.faint, marginTop: 6, lineHeight: 17 },
  cardBody: { marginTop: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  fact: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 0,
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  factValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  factLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, marginTop: 3 },
  moodRow: { marginTop: 18 },
  moodValue: { fontSize: 14, fontWeight: '600', color: colors.ink },
  moodHint: { fontSize: 12, color: colors.muted, marginTop: 5, lineHeight: 18 },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee9e1',
  },
  tableLabel: { flex: 1, fontSize: 13, color: colors.ink },
  tableLabelHead: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, letterSpacing: 0.8 },
  tableCount: {
    width: 46,
    textAlign: 'right',
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.faint,
    letterSpacing: 0.8,
  },
  tableValue: {
    width: 46,
    textAlign: 'right',
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink,
  },
  lastCare: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 14, lineHeight: 16 },
  decayNote: { fontSize: 12, color: colors.faint, marginTop: 8, lineHeight: 18 },
});
