import { Fragment, type ReactNode, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  type BodyProfile,
  type BrainTrainingMetadata,
  type CareDiaryEntry,
  FOCUS_AREAS,
  type HealthEvent,
  type PetState,
  calculateInsights,
  calculateMacroTargets,
  estimateCaloriesBurned,
  findWordPuzzleEventForDate,
  getEventsForDay,
  getMealsForDay,
  isSameDay,
  mindScoreLabel,
  sumMealMacros,
  toDateKey,
} from '@vitto/core';
import { NutrientRing } from '../components/NutrientRing';
import { MealDiaryRow } from '../components/MealDiaryRow';
import { Kicker } from '../components/ui';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { colors, fonts, layout, text } from '../theme';

/**
 * The day's detail: nutrition, care, movement, mind, and whatever the pet
 * noticed. This used to sit under the pet on the dashboard; it moved here so the
 * dashboard is the pet and nothing else — no scrolling, just the companion, the
 * log buttons and the way to your profile. (The dev tools stayed with the pet,
 * since forcing a status is only useful while the sprite is in view.)
 *
 * Everything on this screen is derived from the same props the dashboard held,
 * so nothing was re-modelled in the move — only relocated.
 */
interface Props {
  /** Already projected to now by App; not decayed again here. */
  pet: PetState;
  events: HealthEvent[];
  profile: BodyProfile;
  stepGoal: number;
  onStepGoalChange: (goal: number) => void;
  onTrainMind: () => void;
  /** Optional: the mind card hides the action until the navigation is wired. */
  onOpenWordPuzzle?: () => void;
  /** "Full history →" — Profile lists the user's own events. */
  onOpenProfile: () => void;
  onClose: () => void;
  /**
   * Shared pets: the user's own events merged with the partner's care-log
   * shadows, which is what "Today's care" then lists. Absent for a solo pet.
   */
  careDiary?: CareDiaryEntry[];
  /** Pull-to-refresh, wired only for a shared pet. */
  onRefresh?: () => Promise<void>;
}

/** This screen shows a preview; the profile has the full record. */
const CARE_PREVIEW_LIMIT = 5;

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/** "2h 05m" for the screen-time panel. */
const formatScreenMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

const CARE_EVENT_LABEL: Partial<Record<HealthEvent['type'], string>> = {
  WORKOUT: 'Trained together',
  STEP_ACTIVITY: 'Went exploring',
  BRAIN_TRAINING: 'Trained your mind',
  SLEEP: 'Rested up',
  SCREEN_TIME: 'Screen check-in',
};

/**
 * Which brain sessions count toward a given day. The timed games are stamped the
 * moment they finish, so their completion time is their day. WordPuzzle fixes its
 * day when the board opens, so it is keyed on `puzzleDate` instead.
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

export function TodayScreen({
  pet,
  events,
  profile,
  stepGoal,
  onStepGoalChange,
  onTrainMind,
  onOpenWordPuzzle,
  onOpenProfile,
  onClose,
  careDiary,
  onRefresh,
}: Props) {
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  // Three rings, two 10px gaps, inside 22px page padding: never wider than that.
  const ringSize = Math.max(76, Math.min(104, Math.floor((width - 44 - 20) / 3)));
  const today = new Date();
  const todayKey = toDateKey(today);
  const screenTimeToday = findScreenTimeForDate(events, today);
  // Folds every event into daily rows, so it is keyed on the day rather than on the
  // fresh `today` Date each render hands out. Only the first finding is shown.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `todayKey` stands in for `today`.
  const topInsight = useMemo(() => calculateInsights(events, today)[0] ?? null, [events, todayKey]);
  const todaysEvents = getEventsForDay(events, today);
  const todaysMeals = getMealsForDay(events, today);
  const todaysOther = todaysEvents.filter((event) => event.type !== 'MEAL');
  // What "Today's care" lists. Solo: the user's own non-meal events. Shared: the
  // merged diary — own meals still belong to the diary block, but a partner's
  // "Shared a meal" is a care moment to show here.
  const todaysCare: CareDiaryEntry[] = careDiary
    ? careDiary.filter(
        (entry) => isSameDay(entry.occurredAt, today) && (entry.actorName !== null || entry.type !== 'MEAL'),
      )
    : todaysOther.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        type: event.type,
        label: CARE_EVENT_LABEL[event.type] ?? 'A healthy moment',
        actorUserId: event.userId,
        actorName: null,
      }));
  const shownCare = todaysCare.slice(0, CARE_PREVIEW_LIMIT);
  // The "more" link opens Profile, whose history is the user's OWN events only,
  // so it counts what Profile will actually show: own moments not previewed here.
  const moreCareCount = careDiary
    ? todaysOther.filter((event) => !shownCare.some((entry) => entry.id === event.id)).length
    : todaysCare.length - shownCare.length;
  const todaysMind = mindEventsForDay(events, today);
  const bestMindScore = todaysMind.reduce((best, event) => Math.max(best, event.metadata.score), 0);
  const todaysWordPuzzle = findWordPuzzleEventForDate(events, toDateKey(today));

  const todaySteps = todaysEvents.find((event) => event.type === 'STEP_ACTIVITY');
  const steps = todaySteps ? (todaySteps.metadata as { steps: number }).steps : 0;

  const targets = calculateMacroTargets(profile);
  const consumed = sumMealMacros(todaysMeals);
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;

  const sections: Record<string, ReactNode> = {
    nutrition: (
      <Fragment key="nutrition">
        <View style={styles.rings}>
          <NutrientRing
            value={consumed.calories}
            percent={(consumed.calories / targets.calories) * 100}
            size={ringSize}
            label="Consumed"
            color={colors.coral}
          />
          <NutrientRing
            value={burned}
            percent={(burned / targets.calories) * 100}
            size={ringSize}
            label="Burned"
            color="#78a598"
          />
          <NutrientRing
            value={remaining}
            percent={(Math.abs(remaining) / targets.calories) * 100}
            size={ringSize}
            label={remaining < 0 ? 'Over' : 'Remaining'}
            color={remaining < 0 ? colors.danger : '#9c8dba'}
            emphasis={remaining < 0}
          />
        </View>

        <View style={styles.macros}>
          {[
            ['Protein', consumed.proteinGrams, targets.proteinGrams],
            ['Carbs', consumed.carbsGrams, targets.carbsGrams],
            ['Fat', consumed.fatGrams, targets.fatGrams],
          ].map(([label, value, target]) => (
            <View key={String(label)} style={styles.macroRow}>
              <Text style={styles.macroLabel}>{label}</Text>
              <View style={styles.macroTrack}>
                <View
                  style={[
                    styles.macroFill,
                    { width: `${Math.min(100, (Number(value) / Number(target)) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.macroValue}>
                {value}g <Text style={styles.macroTarget}>/ {target}g</Text>
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Today's diary</Text>
          {todaysMeals.length === 0 ? (
            <Text style={styles.empty}>Nothing logged yet today — add a meal to get started.</Text>
          ) : (
            todaysMeals.map((event) => <MealDiaryRow key={event.id} event={event} />)
          )}
        </View>
      </Fragment>
    ),
    training: (
      <Fragment key="training">
        <View style={styles.block}>
          <View style={layout.between}>
            <Text style={styles.blockTitle}>Today's care</Text>
            <Pressable onPress={onOpenProfile} hitSlop={8}>
              <Text style={styles.link}>Full history →</Text>
            </Pressable>
          </View>
          {todaysCare.length === 0 ? (
            <Text style={styles.empty}>Log a workout, sync steps, or train your mind to see it here.</Text>
          ) : (
            shownCare.map((entry) => (
              <View key={entry.id} style={styles.eventRow}>
                <View style={[styles.dot, entry.actorName !== null && styles.partnerDot]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventName}>
                    {/* Own entries keep the solo wording (CARE_EVENT_LABEL); a partner's
                        carries the type-only label the care log allows, prefixed by who. */}
                    {entry.actorName === null
                      ? (CARE_EVENT_LABEL[entry.type] ?? 'A healthy moment')
                      : `${entry.actorName} · ${entry.label}`}
                  </Text>
                  <Text style={styles.eventTime}>
                    {new Date(entry.occurredAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.eventXp}>+ XP</Text>
              </View>
            ))
          )}
          {moreCareCount > 0 ? (
            <Pressable onPress={onOpenProfile} hitSlop={6}>
              <Text style={styles.moreLink}>
                {moreCareCount} more today →
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Fragment>
    ),
    movement: (
      <Fragment key="movement">
        <View style={styles.panel}>
          <View style={{ flex: 1 }}>
            <Kicker>Today's exploring</Kicker>
            <Text style={styles.panelValue}>
              {steps.toLocaleString()}{' '}
              <Text style={styles.panelUnit}>/ {stepGoal.toLocaleString()} steps</Text>
            </Text>
            <Text style={styles.panelHint}>
              {pet.name} {steps ? 'explored with you today.' : "is waiting for today's adventure."}
            </Text>
          </View>
          <View>
            <Text style={styles.fieldLabel}>Daily goal</Text>
            <TextInput
              style={[layout.input, styles.goalInput]}
              keyboardType="number-pad"
              value={String(stepGoal)}
              onChangeText={(value) => onStepGoalChange(Number(value.replace(/[^0-9]/g, '')) || 1000)}
            />
          </View>
        </View>
      </Fragment>
    ),
    mind: (
      <Fragment key="mind">
        <View style={styles.panel}>
          <View style={{ flex: 1 }}>
            <Kicker>Today's thinking</Kicker>
            <Text style={styles.panelValue}>
              {bestMindScore || '—'}{' '}
              <Text style={styles.panelUnit}>
                best mind score
                {todaysMind.length ? ` · ${todaysMind.length} session${todaysMind.length > 1 ? 's' : ''}` : ''}
              </Text>
            </Text>
            <Text style={styles.panelHint}>
              {todaysMind.length
                ? `${mindScoreLabel(bestMindScore)} — ${pet.name} felt you thinking.`
                : `${pet.name} is up for a puzzle whenever you are.`}
            </Text>
            <View style={styles.mindStat}>
              <Text style={styles.mindStatLabel}>Mind</Text>
              <View style={styles.mindTrack}>
                <View style={[styles.mindFill, { width: `${pet.mind}%` }]} />
              </View>
              <Text style={styles.mindStatValue}>{pet.mind}/100</Text>
            </View>
          </View>
          <View style={styles.mindActions}>
            <Pressable onPress={onTrainMind} hitSlop={8}>
              <Text style={styles.mindLink}>Train →</Text>
            </Pressable>
            {onOpenWordPuzzle ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  todaysWordPuzzle ? "Review today's word puzzle" : "Play today's word puzzle"
                }
                onPress={onOpenWordPuzzle}
                hitSlop={8}
              >
                <Text style={styles.mindLink}>Today's word puzzle →</Text>
                <Text style={[styles.mindNote, todaysWordPuzzle && styles.mindNoteDone]}>
                  {todaysWordPuzzle ? `done · ${todaysWordPuzzle.metadata.score}` : 'not played yet'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Fragment>
    ),
  };

  const orderedFocus = [
    ...profile.focusAreas,
    ...FOCUS_AREAS.filter((area) => !profile.focusAreas.includes(area)),
  ];

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
        <Text style={styles.topTitle}>Today</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.coral} />
          ) : undefined
        }
      >
        {orderedFocus.map((area) => sections[area])}

        {/* Nothing at all until the data can carry a finding -- an empty "keep logging"
            card would be a nag, and the thresholds live in `calculateInsights`. */}
        {topInsight ? (
          <View style={styles.panel}>
            <View style={{ flex: 1 }}>
              <Kicker>{`${pet.name} noticed`}</Kicker>
              <Text style={styles.insightHeadline}>{topInsight.headline}</Text>
              <Text style={styles.panelHint}>{topInsight.detail}</Text>
            </View>
          </View>
        ) : null}

        {/* Only once today is logged (Profile → Screen time); an empty card would be a nag. */}
        {screenTimeToday ? (
          <View style={styles.panel}>
            <View style={{ flex: 1 }}>
              <Kicker>Today's screen time</Kicker>
              <Text style={styles.panelValue}>
                {formatScreenMinutes(screenTimeToday.metadata.minutes)}
                {screenTimeToday.metadata.budgetMinutes !== undefined ? (
                  <Text style={styles.panelUnit}> / {formatScreenMinutes(screenTimeToday.metadata.budgetMinutes)} budget</Text>
                ) : null}
              </Text>
              <Text style={styles.panelHint}>
                {screenTimeToday.metadata.withinBudget === undefined
                  ? `Logged. Set a budget in Profile and ${pet.name} will notice the quiet days.`
                  : screenTimeToday.metadata.withinBudget
                    ? `Under budget — ${pet.name} feels clearer for it.`
                    : 'Over budget today. Tomorrow is a fresh screen.'}
              </Text>
            </View>
          </View>
        ) : null}

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
  body: { paddingHorizontal: 22, paddingTop: 22 },
  rings: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  macros: { gap: 12, marginBottom: 8 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  macroLabel: { width: 56, fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  macroTrack: { flex: 1, minWidth: 0, height: 4, borderRadius: 2, backgroundColor: '#deded7', overflow: 'hidden' },
  macroFill: { height: '100%', backgroundColor: colors.coral },
  macroValue: { fontSize: 13, fontWeight: '600', color: colors.ink, minWidth: 78, textAlign: 'right' },
  macroTarget: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, fontWeight: '400' },
  block: { marginTop: 26 },
  blockTitle: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 6 },
  empty: { fontSize: 13, color: colors.faint, paddingVertical: 14 },
  link: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e2db',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral },
  partnerDot: { backgroundColor: colors.mintDeep },
  eventName: { fontSize: 13, fontWeight: '500', color: colors.ink },
  eventTime: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  eventXp: { fontFamily: fonts.mono, fontSize: 10, color: '#879187' },
  moreLink: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral, paddingVertical: 14 },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  panelValue: { fontSize: 24, fontWeight: '600', color: colors.ink, marginTop: 6 },
  panelUnit: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint, fontWeight: '400' },
  panelHint: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 19 },
  insightHeadline: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 6, lineHeight: 22 },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginBottom: 6 },
  goalInput: { width: 96, textAlign: 'center' },
  mindStat: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  mindStatLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  mindTrack: { width: 110, height: 4, borderRadius: 2, backgroundColor: '#deded7', overflow: 'hidden' },
  mindFill: { height: '100%', backgroundColor: colors.lilacDeep },
  mindStatValue: { fontFamily: fonts.mono, fontSize: 10, color: colors.ink },
  mindLink: { fontFamily: fonts.mono, fontSize: 11, color: colors.lilacDeep },
  mindActions: { alignItems: 'flex-end', gap: 14 },
  mindNote: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, marginTop: 4, textAlign: 'right' },
  mindNoteDone: { color: colors.mintDeep },
});
