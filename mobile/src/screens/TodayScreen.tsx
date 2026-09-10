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

  type TrophyId,  AILMENT_PRECEDENCE,
  type BodyProfile,
  type BrainTrainingMetadata,
  type CareDiaryEntry,
  FOCUS_AREAS,
  type ForcedPetForm,
  type ForcedPetStatus,
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
import { ChoiceRow, Kicker, TextButton } from '../components/ui';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { colors, fonts, layout, text } from '../theme';

/**
 * The day's detail: nutrition, care, movement, mind, whatever the pet noticed,
 * and the dev tools. This used to sit under the pet on the dashboard; it moved
 * here so the dashboard is the pet and nothing else — no scrolling, just the
 * companion, the log buttons and the way to your profile.
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
  /** Dev tools. All absent for normal accounts, which hides every panel. */
  forcedAilment?: ForcedPetStatus | null;
  onForceAilment?: (status: ForcedPetStatus | null) => void;
  forcedForm?: ForcedPetForm | null;
  onForceForm?: (form: ForcedPetForm | null) => void;
  onSeedTestData?: () => void;
  onClearSeededData?: () => void;
  isSeeding?: boolean;
  /** Dev tool: pretend to be walking or at the gym, so both ambient cues (see
   * mobile/AMBIENT.md) can be checked at a desk without real sensors. */
  forcedAmbient?: ForcedAmbient | null;
  onForceAmbient?: (state: ForcedAmbient | null) => void;
  forcedTrophies?: ForcedTrophies | null;
  onForceTrophies?: (state: ForcedTrophies | null) => void;
  /** Forgets which achievement unlocks have been shown, so every earned one pops again. */
  onReplayAchievements?: () => void;
  /**
   * What the sensors are actually reporting. Both ambient hooks fail quietly by
   * design, so on a device "permission denied", "no such sensor" and "you are
   * standing still" are indistinguishable from the outside — this is how you
   * tell them apart while testing.
   */
  ambientDebug?: {
    walkingPermission: string;
    steps: number;
    gymPermission: string;
    gymSaved: boolean;
    distance: number | null;
  };
}

export type ForcedAmbient = 'walking' | 'gym';

/**
 * Dev-only override for the living-room shelf: a single trophy, all of them,
 * or none — so every plank can be checked without a month of logging. Nothing
 * here is saved; `earnedTrophies` is the only real source.
 */
export type ForcedTrophies = 'none' | TrophyId | 'all';
type DevTrophyChoice = 'live' | ForcedTrophies;
const DEV_TROPHY_OPTIONS: { value: DevTrophyChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'earned from history' },
  { value: 'none', label: 'None' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'shoe', label: 'Shoe' },
  { value: 'drumstick', label: 'Drumstick' },
  { value: 'book', label: 'Book' },
  { value: 'all', label: 'All four' },
];
type DevAmbientChoice = ForcedAmbient | 'live';

const DEV_AMBIENT_OPTIONS: { value: DevAmbientChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real sensors' },
  { value: 'walking', label: 'Walking' },
  { value: 'gym', label: 'At gym' },
];

type DevAilmentChoice = ForcedPetStatus | 'live';

/**
 * Built from the precedence list so a new ailment shows up here for free.
 * 'Live' drops the override; 'Healthy' forces the well state. Both are needed:
 * on a compressed decay clock "live" is usually an ailing pet.
 */
const DEV_AILMENT_OPTIONS: { value: DevAilmentChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real stats' },
  { value: 'healthy', label: 'Healthy' },
  ...AILMENT_PRECEDENCE.map((ailment) => ({
    value: ailment as DevAilmentChoice,
    label: ailment.charAt(0).toUpperCase() + ailment.slice(1),
  })),
];

type DevFormChoice = ForcedPetForm | 'live';

/** Forms to preview. An evolution is weeks of real training away otherwise. */
const DEV_FORM_OPTIONS: { value: DevFormChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real form' },
  { value: 'base', label: 'Base', detail: 'unevolved' },
  { value: 'runner', label: 'Runner', detail: 'evolved' },
  { value: 'lifter', label: 'Lifter', detail: 'evolved · strength' },
  { value: 'scholar', label: 'Scholar', detail: 'evolved · mind' },
];

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
  forcedAilment,
  onForceAilment,
  forcedForm,
  onForceForm,
  onSeedTestData,
  onClearSeededData,
  isSeeding,
  forcedAmbient,
  onForceAmbient,
  forcedTrophies,
  onForceTrophies,
  onReplayAchievements,
  ambientDebug,
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

        {/* Dev accounts only — the setters are simply not passed otherwise. Last,
            so the day's own readings come first. */}
        {onForceAilment ? (
          <View style={styles.devPanel}>
            <Kicker>Dev · force status</Kicker>
            <View style={styles.devChoices}>
              <ChoiceRow
                options={DEV_AILMENT_OPTIONS}
                value={forcedAilment ?? 'live'}
                onChange={(next) => onForceAilment(next === 'live' ? null : next)}
              />
            </View>
            <Text style={styles.devHint}>
              Rewrites the stats shown on the pet. Nothing here is saved, and logging real care
              clears it back to whatever {pet.name} actually is.
            </Text>
          </View>
        ) : null}

        {onForceForm ? (
          <View style={styles.devPanel}>
            <Kicker>Dev · force form</Kicker>
            <View style={styles.devChoices}>
              <ChoiceRow
                options={DEV_FORM_OPTIONS}
                value={forcedForm ?? 'live'}
                onChange={(next) => onForceForm(next === 'live' ? null : next)}
              />
            </View>
            <Text style={styles.devHint}>
              Moves level, endurance, strength and mind, so the sprite, the kicker and the
              stat bars all agree. A specialism needs the evolution level — base stays under it.
            </Text>
          </View>
        ) : null}

        {onForceAmbient ? (
          <View style={styles.devPanel}>
            <Kicker>Dev · force ambient</Kicker>
            <View style={styles.devChoices}>
              <ChoiceRow
                options={DEV_AMBIENT_OPTIONS}
                value={forcedAmbient ?? 'live'}
                onChange={(next) => onForceAmbient(next === 'live' ? null : next)}
              />
            </View>
            <Text style={styles.devHint}>
              Pretends the user is walking or at the gym (see mobile/AMBIENT.md), so both
              cues can be checked here without real sensors. Nothing here is saved.
            </Text>
          </View>
        ) : null}

        {onForceTrophies ? (
          <View style={styles.devPanel}>
            <Kicker>Dev · force trophies</Kicker>
            <View style={styles.devChoices}>
              <ChoiceRow
                options={DEV_TROPHY_OPTIONS}
                value={forcedTrophies ?? 'live'}
                onChange={(next) => onForceTrophies(next === 'live' ? null : next)}
              />
            </View>
            <Text style={styles.devHint}>
              Puts trophies on the living-room shelf without earning them: the dumbbell is a
              month at your weekly workout target, the shoe is 10k steps a day for a month,
              the drumstick is a month of hitting your calorie and protein goals, the book
              is a month of daily mind-gym sessions. Nothing here is saved.
            </Text>
            {onReplayAchievements ? (
              <View style={styles.devChoices}>
                <TextButton label="Replay achievement unlocks" onPress={onReplayAchievements} />
              </View>
            ) : null}
          </View>
        ) : null}

        {ambientDebug ? (
          <View style={styles.devPanel}>
            <Kicker>Dev · sensors</Kicker>
            <Text style={styles.devReadout}>
              walking: {ambientDebug.walkingPermission} · {ambientDebug.steps} steps in window
            </Text>
            <Text style={styles.devReadout}>
              gym: {ambientDebug.gymPermission} ·{' '}
              {ambientDebug.gymSaved
                ? ambientDebug.distance === null
                  ? 'saved, no fix yet'
                  : `${ambientDebug.distance}m away`
                : 'not set'}
            </Text>
            <Text style={styles.devHint}>
              Live, not forced. `denied` or `unavailable` means the cue can never fire — walking
              needs a real device, since the simulator has no pedometer.
            </Text>
          </View>
        ) : null}

        {onSeedTestData ? (
          <View style={styles.devPanel}>
            <Kicker>Dev · test data</Kicker>
            <View style={styles.devChoices}>
              <TextButton
                label={isSeeding ? 'Working…' : 'Seed 90 days'}
                onPress={onSeedTestData}
                disabled={isSeeding}
              />
              <TextButton
                label="Clear seeded"
                onPress={() => onClearSeededData?.()}
                disabled={isSeeding}
              />
            </View>
            <Text style={styles.devHint}>
              Writes ~90 days of synthetic events so the insight thresholds have enough to
              compare — a real account stays silent for weeks. It fills the event log only:
              {pet.name}'s own stats and decay anchor are left alone. Use a throwaway account,
              since this lands in the diary and the streak alongside real history.
            </Text>
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
  devPanel: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  devChoices: { marginTop: 12 },
  devHint: { fontSize: 12, color: colors.faint, marginTop: 10, lineHeight: 17 },
  devReadout: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink, marginTop: 8 },
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
