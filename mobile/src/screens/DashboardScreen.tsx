import { Fragment, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { type BodyProfile, type BrainTrainingMetadata, EVOLUTION_STAGE_LABEL, FOCUS_AREAS, type HealthEvent, type MealAnalysis, type PetReaction, type PetState, calculateMacroTargets, calculateStreaks, daysWithPet, estimateCaloriesBurned, findInklingEventForDate, getEventsForDay, getEvolutionStage, getMealsForDay, isSameDay, mindScoreLabel, sumMealMacros, toDateKey } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { NutrientRing } from '../components/NutrientRing';
import { MealDiaryRow } from '../components/MealDiaryRow';
import { Kicker } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  pet: PetState;
  events: HealthEvent[];
  profile: BodyProfile;
  reaction: PetReaction | null;
  stepGoal: number;
  onStepGoalChange: (goal: number) => void;
  onLogMeal: () => void;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
  /**
   * Opens today's Inkling board. Optional: the mind card hides the action until the
   * navigation is wired, so this screen stays renderable without it.
   */
  onOpenInkling?: () => void;
  onOpenProfile: () => void;
  /** Opens the full stat sheet — the HUD on the pet is the way in. */
  onOpenStats: () => void;
  /** Letter shown in the account button — the signed-in email's initial. */
  accountInitial?: string;
  isAnalyzingMeal: boolean;
  isEating: boolean;
  feedingImage: string | null;
  feedingGrade: MealAnalysis['grade'] | null;
  isCelebrating: boolean;
  isWorkingOut: boolean;
  isExploring: boolean;
}

interface QuickAction {
  key: string;
  label: string;
  icon: string;
  tint: string;
  ink: string;
}

/** The four things you can log, kept within thumb reach at all times. */
const QUICK_ACTIONS: QuickAction[] = [
  { key: 'meal', label: 'Meal', icon: '✣', tint: colors.yellow, ink: colors.yellowDeep },
  { key: 'workout', label: 'Workout', icon: '↗', tint: colors.coralWash, ink: colors.coralDeep },
  { key: 'steps', label: 'Steps', icon: '⁁', tint: colors.mint, ink: colors.mintDeep },
  { key: 'mind', label: 'Mind', icon: '✻', tint: colors.lilac, ink: colors.lilacDeep },
];

// Clears the home indicator on modern iPhones without pulling in a safe-area
// package, which drags a second copy of React into the workspace.
/** The dashboard shows a preview; the profile has the full record. */
const CARE_PREVIEW_LIMIT = 5;

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

const CARE_EVENT_LABEL: Partial<Record<HealthEvent['type'], string>> = {
  WORKOUT: 'Trained together',
  STEP_ACTIVITY: 'Went exploring',
  BRAIN_TRAINING: 'Trained your mind',
};

/**
 * Which brain sessions count toward a given day. The timed games are stamped the
 * moment they finish, so their completion time is their day. Inkling fixes its day
 * when the board opens, so it is keyed on `puzzleDate` instead — a puzzle carried
 * past midnight still belongs to the day it was set for, and the count agrees with
 * the Inkling action beside it.
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

export function DashboardScreen({
  pet,
  events,
  profile,
  reaction,
  stepGoal,
  onStepGoalChange,
  onLogMeal,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
  onOpenInkling,
  onOpenProfile,
  onOpenStats,
  accountInitial,
  isAnalyzingMeal,
  isEating,
  feedingImage,
  feedingGrade,
  isCelebrating,
  isWorkingOut,
  isExploring,
}: Props) {
  const { width } = useWindowDimensions();
  // Three rings, two 10px gaps, inside 22px page padding: never wider than that.
  const ringSize = Math.max(76, Math.min(104, Math.floor((width - 44 - 20) / 3)));
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const todaysMeals = getMealsForDay(events, today);
  const todaysOther = todaysEvents.filter((event) => event.type !== 'MEAL');
  const todaysMind = mindEventsForDay(events, today);
  const bestMindScore = todaysMind.reduce((best, event) => Math.max(best, event.metadata.score), 0);
  const todaysInkling = findInklingEventForDate(events, toDateKey(today));

  const todaySteps = todaysEvents.find((event) => event.type === 'STEP_ACTIVITY');
  const steps = todaySteps ? (todaySteps.metadata as { steps: number }).steps : 0;

  const targets = calculateMacroTargets(profile);
  const consumed = sumMealMacros(todaysMeals);
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;
  const streaks = calculateStreaks(events, today);
  const stage = getEvolutionStage(pet.level);

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
          {todaysOther.length === 0 ? (
            <Text style={styles.empty}>Log a workout, sync steps, or train your mind to see it here.</Text>
          ) : (
            todaysOther.slice(0, CARE_PREVIEW_LIMIT).map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventName}>
                    {CARE_EVENT_LABEL[event.type] ?? 'A healthy moment'}
                  </Text>
                  <Text style={styles.eventTime}>
                    {new Date(event.occurredAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.eventXp}>+ XP</Text>
              </View>
            ))
          )}
          {todaysOther.length > CARE_PREVIEW_LIMIT ? (
            <Pressable onPress={onOpenProfile} hitSlop={6}>
              <Text style={styles.moreLink}>
                {todaysOther.length - CARE_PREVIEW_LIMIT} more today →
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
            {onOpenInkling ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  todaysInkling ? "Review today's Inkling" : "Play today's Inkling"
                }
                onPress={onOpenInkling}
                hitSlop={8}
              >
                <Text style={styles.mindLink}>Today's Inkling →</Text>
                <Text style={[styles.mindNote, todaysInkling && styles.mindNoteDone]}>
                  {todaysInkling ? `done · ${todaysInkling.metadata.score}` : 'not played yet'}
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

  const onQuickAction = (key: string) => {
    if (key === 'meal') return onLogMeal();
    if (key === 'workout') return onLogWorkout();
    if (key === 'steps') return onSyncSteps();
    return onTrainMind();
  };

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkLetter}>v</Text>
          </View>
          <Text style={styles.brandName}>vitto</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          onPress={onOpenProfile}
          hitSlop={8}
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
        >
          <Text style={styles.avatarLetter}>
            {(accountInitial ?? pet.name.charAt(0)).toUpperCase()}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={layout.screen}
        contentContainerStyle={[styles.body, { paddingBottom: 96 + HOME_INDICATOR_INSET }]}
      >
      <View style={styles.hero}>
        <Kicker>
          {EVOLUTION_STAGE_LABEL[stage].toUpperCase()} · DAY {daysWithPet(pet, today)} WITH{' '}
          {pet.name.toUpperCase()}
        </Kicker>
        <Text style={styles.petName}>{pet.name}</Text>
        <Text style={styles.mood}>
          {reaction?.message ?? `${pet.name} is feeling ${pet.mood}.`}
        </Text>
        <View style={styles.heroMeta}>
          <Text style={styles.heroLabel}>
            Level {pet.level} · {pet.xp}/100 XP
          </Text>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${pet.xp}%` }]} />
          </View>
          {streaks.currentStreak > 0 ? (
            <Text style={styles.streak}>
              🔥 {streaks.currentStreak} day streak · best {streaks.longestStreak}
            </Text>
          ) : null}
        </View>
      </View>

      <PetAvatar
        pet={pet}
        isAnalyzingMeal={isAnalyzingMeal}
        isEating={isEating}
        feedingImage={feedingImage}
        feedingGrade={feedingGrade}
        isCelebrating={isCelebrating}
        isWorkingOut={isWorkingOut}
        isExploring={isExploring}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open pet stats"
          onPress={onOpenStats}
          hitSlop={6}
          style={({ pressed }) => [styles.hudTap, pressed && styles.hudTapPressed]}
        >
          <View style={styles.hud}>
            <Text style={styles.hudTitle}>VITALS</Text>
            {(
              [
                ['Push', pet.pushingStrength],
                ['Pull', pet.pullingStrength],
                ['Legs', pet.legStrength],
                ['Endurance', pet.endurance],
                ['Mind', pet.mind],
                ['Health', pet.health],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={styles.hudRow}>
                <Text style={styles.hudLabel}>{label}</Text>
                <View style={styles.hudTrack}>
                  <View style={[styles.hudFill, { width: `${value}%` }]} />
                </View>
              </View>
            ))}
            <Text style={styles.hudMore}>All stats →</Text>
          </View>
        </Pressable>
      </PetAvatar>

      <View style={styles.dashboard}>
        {orderedFocus.map((area) => sections[area])}

        <View style={styles.panel}>
          <View style={{ flex: 1 }}>
            <Kicker>Today's screen time</Kicker>
            <Text style={styles.panelValue}>
              — <Text style={styles.panelUnit}>nothing logged yet</Text>
            </Text>
            <Text style={styles.panelHint}>
              Screen time tracking is not built yet — {pet.name} will notice the quiet hours once it is.
            </Text>
          </View>
          <Text style={styles.soonTag}>Placeholder</Text>
        </View>

      </View>
      </ScrollView>

      <View style={styles.actionBar}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={`Log ${action.label.toLowerCase()}`}
            onPress={() => onQuickAction(action.key)}
            style={({ pressed }) => [styles.barItem, pressed && styles.barItemPressed]}
          >
            <View style={[styles.barIcon, { backgroundColor: action.tint }]}>
              <Text style={{ color: action.ink, fontSize: 17 }}>{action.icon}</Text>
            </View>
            <Text style={styles.barLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 60 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    backgroundColor: colors.paper,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkLetter: { fontFamily: fonts.display, fontSize: 16, color: '#fff' },
  brandName: { fontSize: 19, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#d8e1d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressed: { opacity: 0.7 },
  avatarLetter: { fontSize: 14, fontWeight: '700', color: colors.ink },
  hero: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 26 },
  petName: { ...text.display, fontSize: 42, marginTop: 14 },
  mood: { ...text.body, marginTop: 10 },
  heroMeta: { marginTop: 20 },
  heroLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint },
  xpTrack: { height: 4, borderRadius: 2, backgroundColor: '#deded7', marginTop: 8, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: colors.coral, borderRadius: 2 },
  streak: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 10 },
  hudTap: { position: 'absolute', top: 16, left: 16, zIndex: 2 },
  hudTapPressed: { opacity: 0.6 },
  hud: { width: 128 },
  hudMore: { fontFamily: fonts.mono, fontSize: 8, color: '#5f7167', marginTop: 2 },
  hudTitle: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: '#5f7167', marginBottom: 8 },
  hudRow: { marginBottom: 6 },
  hudLabel: { fontFamily: fonts.mono, fontSize: 8, color: '#55705d', marginBottom: 3 },
  hudTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' },
  hudFill: { height: '100%', backgroundColor: '#55705d' },
  dashboard: { paddingHorizontal: 22, paddingTop: 28 },
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
  soonTag: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.faint,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: HOME_INDICATOR_INSET,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    // Lifts the bar off the content scrolling beneath it.
    shadowColor: '#26312d',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  barItem: { alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingTop: 2 },
  barItemPressed: { opacity: 0.6 },
  barIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  barLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, letterSpacing: 0.3 },
});
