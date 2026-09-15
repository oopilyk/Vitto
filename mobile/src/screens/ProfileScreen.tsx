import { useMemo, useState, type ReactNode } from 'react';
import {
  type LayoutChangeEvent,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {

  measurementSystemOf,
  ACHIEVEMENTS,
  type AchievementId,
  type TrophyId,  type BodyProfile,
  type BrainTrainingMetadata,
  type HealthEvent,
  type MealMetadata,
  type ScreenTimeMetadata,
  calculateMacroTargets,
  calculateQualifyingStreaks,
  convertWeightValue,
  estimateCaloriesBurned,
  getActiveDateKeys,
  getEventsForDay,
  getMealsForDay,
  sumMealMacros,
  type Reminder,
  type Weekday,
  WEEKDAYS,
  WEEKDAY_LABEL,
  describeReminderDays,
  formatReminderTime,
  reminderError,
  normalizeReminderLabel,
  errorMessage} from '@vitto/core';
import { BIG_LIFTS, MAX_BIO_LENGTH, formatPace, liftStanding, normalizeBio, ordinal, overallStanding, personalRecords, runRecords } from '@vitto/core';
import { NutrientRing } from '../components/NutrientRing';
import { MealDiaryRow } from '../components/MealDiaryRow';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { ChoiceRow, Field, Kicker, NumberField, PrimaryButton, TextButton } from '../components/ui';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  profile: BodyProfile;
  events: HealthEvent[];
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
  /** Opens Settings — about you, your goal, your training. Omitted where it is not wired up (tests). */
  onOpenSettings?: () => void;
  /**
   * Opens the Friends screen, which owns claiming a username. Offered here only
   * as a way to go and set one; this screen never writes it. Absent offline,
   * where there is nobody to be a friend of.
   */
  onOpenFriends?: () => void;
  onSignOut?: () => void;
  /**
   * Every achievement earned so far, badges and trophies. The card lists ALL
   * of them either way -- a locked one with its rule showing is the only place
   * the goals are written down, so hiding them would make the shelf unexplained.
   */
  achievements?: readonly AchievementId[];
  /** Omitted entirely on platforms with no HealthKit provider (Android, web). */
  appleHealthStatus?: 'disconnected' | 'connected';
  onConnectAppleHealth?: () => void;
  onSyncAppleHealth?: () => void;
  isSyncingAppleHealth?: boolean;
  /**
   * Logs a manually entered screen-time total for today (any platform). Should
   * reject with a readable message when today is already logged.
   */
  onLogScreenTime?: (minutes: number, budgetMinutes?: number) => Promise<void>;
  /** Android only: the UsageStatsManager path. Omitted wherever the native module is absent. */
  screenTimeAccess?: {
    granted: boolean;
    onOpenSettings: () => void;
    onSync: (budgetMinutes?: number) => void;
    syncing?: boolean;
  };
  /**
   * The user's own reminders — "take my creatine at 8am". Absent where local
   * notifications cannot be scheduled, which hides the card.
   */
  reminders?: {
    items: Reminder[];
    permission: string;
    onAdd: (draft: { label: string; hour: number; minute: number; days: Weekday[] }) => Promise<void>;
    onToggle: (id: string) => void;
    onRemove: (id: string) => void;
  };
  /**
   * "My gym": one coordinate, kept on this device, that parks a dumbbell beside
   * the pet whenever the app is open nearby. Absent where location cannot be
   * read (web), which hides the card. See mobile/AMBIENT.md.
   */
  gym?: {
    saved: boolean;
    busy: boolean;
    error: string | null;
    onSetHere: () => void;
    onClear: () => void;
  };
}

/** The same art the living-room shelf uses, so the list and the shelf cannot disagree. */
const TROPHY_ART: Record<TrophyId, ReturnType<typeof require>> = {
  dumbbell: require('../../assets/trophies/dumbbell.png'),
  shoe: require('../../assets/trophies/shoe.png'),
  drumstick: require('../../assets/trophies/drumstick.png'),
  book: require('../../assets/trophies/book.png'),
};


const HISTORY_PAGE_SIZE = 20;
/** Achievement rows shown before "Show all". */
const ACHIEVEMENTS_PREVIEW = 5;
const MINUTES_PER_DAY = 24 * 60;

/** "2h 05m" for the screen-time card; whole minutes in, so no rounding surprises. */
const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

/** Splits a minute total into the hours + minutes pair the fields show. */
const splitMinutes = (minutes: number | undefined) =>
  minutes === undefined ? { hours: undefined, minutes: undefined } : { hours: Math.floor(minutes / 60), minutes: minutes % 60 };

/**
 * Joins the pair back. An empty pair and a zero total both mean "no value":
 * zero is "no budget" to the engine, the mapping and the database check alike,
 * so it must never be stored as a number. A pair with an unparsable half (the
 * field accepts "1.2.3") yields NaN, which callers gate on with Number.isFinite.
 */
const joinMinutes = (hours: number | undefined, minutes: number | undefined): number | undefined => {
  if (hours === undefined && minutes === undefined) return undefined;
  const total = Math.round((hours ?? 0) * 60 + (minutes ?? 0));
  if (!Number.isFinite(total)) return Number.NaN;
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, total));
  return clamped === 0 ? undefined : clamped;
};

/** Raw text → number for the budget fields; empty stays undefined so joinMinutes can tell "blank" from "0". */
const parseField = (value: string): number | undefined => (value.trim() === '' ? undefined : Number(value));

/** What the budget fields show for a stored total — only used to seed and reset them, never while typing. */
const budgetText = (minutes: number | undefined) => {
  const split = splitMinutes(minutes);
  return { hours: split.hours === undefined ? '' : String(split.hours), minutes: split.minutes === undefined ? '' : String(split.minutes) };
};
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

const describeEvent = (event: HealthEvent): string => {
  if (event.type === 'WORKOUT') return 'Workout';
  if (event.type === 'STEP_ACTIVITY') return 'Steps';
  if (event.type === 'BRAIN_TRAINING') {
    const session = event.metadata as BrainTrainingMetadata;
    return `${session.game === 'math' ? 'Quick maths' : 'Read and recall'} · ${session.score} mind score`;
  }
  if (event.type === 'SCREEN_TIME') {
    const screen = event.metadata as ScreenTimeMetadata;
    const verdict = screen.withinBudget === undefined ? '' : screen.withinBudget ? ' · under budget' : ' · over budget';
    return `Screen time · ${formatMinutes(screen.minutes)}${verdict}`;
  }
  return 'Healthy moment';
};

/** A titled card. Grouping the form this way keeps any one screenful readable. */
function Card({
  title,
  hint,
  children,
  onLayout,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  /** Where the card sits in the scroll content -- so a deep link can scroll to it. */
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.card} onLayout={onLayout}>
      <Kicker>{title}</Kicker>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function ProfileScreen({
  profile: initial,
  events,
  onSave,
  onClose,
  onOpenFriends,
  onOpenSettings,
  onSignOut,
  achievements,
  appleHealthStatus,
  onConnectAppleHealth,
  onSyncAppleHealth,
  isSyncingAppleHealth,
  onLogScreenTime,
  screenTimeAccess,
  reminders,
  gym,
}: Props) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  // The budget fields hold raw text so they never re-normalise under the
  // user's fingers ("90" minutes must not flip to 1h/30m mid-entry); the joined
  // total is what lands in the profile.
  const [budgetFields, setBudgetFields] = useState(() => budgetText(initial.screenTimeBudgetMinutes));
  // Today's screen-time entry, as the hours/minutes pair the user types.
  const [screenHours, setScreenHours] = useState<number | undefined>(undefined);
  const [screenMinutes, setScreenMinutes] = useState<number | undefined>(undefined);
  const [screenTimeError, setScreenTimeError] = useState<string | null>(null);
  // The reminder being composed. Kept as text so a half-typed time does not
  // fight the field the way a number would.
  const [reminderLabel, setReminderLabel] = useState('');
  const [reminderHour, setReminderHour] = useState<number | undefined>(8);
  const [reminderMinute, setReminderMinute] = useState<number | undefined>(0);
  const [reminderDays, setReminderDays] = useState<Weekday[]>([]);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [loggingScreenTime, setLoggingScreenTime] = useState(false);

  // Drives the save bar: it only appears once something actually differs.
  const dirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(initial),
    [profile, initial],
  );

  const update = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const digits = (value: string, decimals = false) =>
    value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '');

  const targets = calculateMacroTargets(profile);
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const consumed = sumMealMacros(getMealsForDay(events, today));
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;
  const streaks = calculateQualifyingStreaks(events, today);
  // The board: heaviest ticked set per big lift, then the two run records, all
  // in the units the profile is kept in.
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const runs = runRecords(events, measurementSystemOf(profile));
  // Each lift is also placed against people of the same sex, bodyweight and age.
  // `liftStanding` works in kilograms, so a pounds profile converts back first.
  const lifts = personalRecords(events, profile.weightUnit, BIG_LIFTS).map(({ exercise, record }) => ({
    exercise,
    record,
    standing: record
      ? liftStanding(exercise, convertWeightValue(record.weight, profile.weightUnit, 'kg'), profile)
      : null,
  }));
  const overall = overallStanding(lifts.map((lift) => lift.standing));
  const board: { label: string; value: string | null; unit?: string; meta: string; note?: string }[] = [
    ...lifts.map(({ exercise, record, standing }) => ({
      label: exercise,
      value: record ? String(record.weight) : null,
      unit: profile.weightUnit,
      meta: record ? `× ${record.reps} · ${shortDate(record.occurredAt)}` : 'not yet lifted',
      ...(standing ? { note: `${ordinal(standing.percentile)} · ${standing.label}` } : {}),
    })),
    {
      label: runs.unit === 'mi' ? 'Fastest mile' : 'Fastest km',
      value: runs.fastest ? formatPace(runs.fastest.paceMinutes) : null,
      unit: `/${runs.unit}`,
      meta: runs.fastest ? `${runs.fastest.distance} ${runs.unit} · ${shortDate(runs.fastest.occurredAt)}` : 'no runs yet',
    },
    {
      label: 'Longest run',
      value: runs.longest ? String(runs.longest.distance) : null,
      unit: runs.unit,
      meta: runs.longest ? `${runs.longest.durationMinutes} min · ${shortDate(runs.longest.occurredAt)}` : 'no runs yet',
    },
  ];
  const onBoard = board.filter((tile) => tile.value !== null).length;
  const counts = [
    [events.filter((event) => event.type === 'MEAL').length, 'meals logged'],
    [events.filter((event) => event.type === 'WORKOUT').length, 'workouts'],
    [events.filter((event) => event.type === 'BRAIN_TRAINING').length, 'mind sessions'],
    [events.length, 'care moments'],
  ] as const;

  const addReminder = async () => {
    if (!reminders) return;
    const draft = {
      label: reminderLabel,
      hour: reminderHour ?? -1,
      minute: reminderMinute ?? 0,
      days: reminderDays,
    };
    const problem = reminderError(draft, reminders.items.length);
    if (problem) {
      setReminderMessage(problem);
      return;
    }
    setReminderBusy(true);
    try {
      await reminders.onAdd(draft);
      setReminderLabel('');
      setReminderDays([]);
      setReminderMessage(null);
    } catch (cause) {
      setReminderMessage(errorMessage(cause, 'Could not save that reminder.'));
    } finally {
      setReminderBusy(false);
    }
  };

  const screenTimeToday = findScreenTimeForDate(events, today);
  const screenTimeEntry = joinMinutes(screenHours, screenMinutes);
  // A blank pair joins to undefined, a typed one to a number; NaN (a stray
  // second decimal point) must never reach the log button.
  const canLogScreenTime = screenTimeEntry !== undefined && Number.isFinite(screenTimeEntry);

  const updateBudget = (next: { hours: string; minutes: string }) => {
    setBudgetFields(next);
    const joined = joinMinutes(parseField(next.hours), parseField(next.minutes));
    // Leave the stored budget alone while a half is unparsable; the text keeps
    // what was typed, and the next keystroke resolves it.
    if (joined === undefined || Number.isFinite(joined)) update('screenTimeBudgetMinutes', joined);
  };

  const discard = () => {
    setProfile(initial);
    setBudgetFields(budgetText(initial.screenTimeBudgetMinutes));
  };

  const logScreenTime = async () => {
    if (!onLogScreenTime || screenTimeEntry === undefined || !Number.isFinite(screenTimeEntry)) return;
    setLoggingScreenTime(true);
    setScreenTimeError(null);
    try {
      // The budget as shown on screen, saved or not: scoring against a number
      // the user cannot see would be baffling.
      await onLogScreenTime(screenTimeEntry, profile.screenTimeBudgetMinutes);
      setScreenHours(undefined);
      setScreenMinutes(undefined);
    } catch (cause) {
      setScreenTimeError(cause instanceof Error ? cause.message : 'Could not log screen time.');
    } finally {
      setLoggingScreenTime(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const earnedCount = ACHIEVEMENTS.filter((achievement) => (achievements ?? []).includes(achievement.id)).length;
  // Sixteen rows is most of a screen: the first few show by default and one
  // tap shows the lot.
  const [showAchievements, setShowAchievements] = useState(false);
  const visibleAchievements = showAchievements ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, ACHIEVEMENTS_PREVIEW);

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Pet</Text>
        </Pressable>
        <Text style={styles.topTitle}>Profile</Text>
        {onOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={onOpenSettings}
            hitSlop={8}
            style={[styles.back, styles.settings]}
          >
            <Text style={styles.backLabel}>Settings</Text>
            <Text style={styles.backMark}>→</Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: (dirty ? 110 : 40) + HOME_INDICATOR_INSET }]}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          Who you are, above everything the app measures about you. The handle
          and the note are the only things on this screen another person ever
          sees, so they are grouped together and away from the body metrics.
        */}
        <Card title="You">
          <View style={styles.identity}>
            <View style={styles.identityAvatar}>
              <Text style={styles.identityInitial}>
                {(profile.displayName?.trim() || profile.username || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[layout.input, styles.identityName]}
                value={profile.displayName ?? ''}
                onChangeText={(value) => update('displayName', value)}
                placeholder="Your name"
                placeholderTextColor={colors.faint}
                maxLength={40}
                accessibilityLabel="Your display name"
              />
              {profile.username ? (
                <Text style={styles.identityHandle}>{`@${profile.username}`}</Text>
              ) : onOpenFriends ? (
                <Pressable accessibilityRole="button" onPress={onOpenFriends} hitSlop={6}>
                  <Text style={styles.identityHandleUnset}>Pick a username in Friends</Text>
                </Pressable>
              ) : (
                <Text style={styles.identityHandleUnset}>No username yet</Text>
              )}
            </View>
          </View>

          {/* "Bio", not "About" — the body-metrics card that used to live on this
              screen was called "About you", and it now lives in Settings. Two
              things by that name on one screen would be nothing but confusing. */}
          <Group label="BIO">
            <TextInput
              style={[layout.input, styles.bio]}
              value={profile.bio ?? ''}
              onChangeText={(value) => update('bio', value.slice(0, MAX_BIO_LENGTH))}
              onBlur={() => update('bio', normalizeBio(profile.bio ?? ''))}
              placeholder="A line about you — what you are training for, what you are working on."
              placeholderTextColor={colors.faint}
              multiline
              maxLength={MAX_BIO_LENGTH}
              accessibilityLabel="Your bio"
            />
            <Text style={styles.bioCount}>
              {`${(profile.bio ?? '').length} / ${MAX_BIO_LENGTH} · friends can see your name, handle and this note`}
            </Text>
          </Group>
        </Card>

        <Card title="Today">
          <View style={styles.rings}>
            <NutrientRing
              value={consumed.calories}
              percent={(consumed.calories / targets.calories) * 100}
              label="Consumed"
              color={colors.coral}
              size={88}
            />
            <NutrientRing
              value={burned}
              percent={(burned / targets.calories) * 100}
              label="Burned"
              color="#78a598"
              size={88}
            />
            <NutrientRing
              value={remaining}
              percent={(Math.abs(remaining) / targets.calories) * 100}
              label={remaining < 0 ? 'Over' : 'Remaining'}
              color={remaining < 0 ? colors.danger : '#9c8dba'}
              emphasis={remaining < 0}
              size={88}
            />
          </View>
          <Text style={styles.targetLine}>
            Target {targets.calories.toLocaleString()} kcal · {targets.proteinGrams}g protein ·{' '}
            {targets.carbsGrams}g carbs · {targets.fatGrams}g fat
          </Text>
        </Card>

        <Card title="Consistency">
          <View style={styles.streakRow}>
            <View>
              <Text style={styles.streakValue}>{streaks.currentStreak}</Text>
              <Text style={styles.streakUnit}>day streak</Text>
            </View>
            <View style={styles.streakDivider} />
            <View>
              <Text style={styles.streakValue}>{streaks.longestStreak}</Text>
              <Text style={styles.streakUnit}>longest run</Text>
            </View>
          </View>
          <ActivityCalendar activeDateKeys={getActiveDateKeys(events)} />
          <View style={styles.counts}>
            {counts.map(([value, label]) => (
              <View key={label} style={styles.count}>
                <Text style={styles.countValue}>{value}</Text>
                <Text style={styles.countLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card
          title="Personal records"
          hint={
            onBoard === 0
              ? 'Your best on each big lift and on the road, read from the workouts you log'
              : `Your best on each big lift and on the road · ${onBoard} of ${board.length} on the board`
          }
        >
          <View style={styles.records} accessibilityLabel="Personal records">
            {board.map(({ label, value, unit, meta, note }) => (
              <View key={label} style={[styles.record, value === null && styles.recordEmpty]}>
                <Text style={styles.recordLift}>{label}</Text>
                <Text style={[styles.recordValue, value === null && styles.recordValueEmpty]}>
                  {value ?? '—'}
                  {value !== null && unit ? <Text style={styles.recordUnit}> {unit}</Text> : null}
                </Text>
                <Text style={styles.recordMeta}>{meta}</Text>
                {note ? <Text style={styles.recordRank}>{note}</Text> : null}
              </View>
            ))}
          </View>
          {overall ? (
            <Text style={styles.recordFootnote}>
              {`Across your logged lifts you sit around the ${ordinal(overall.percentile)} percentile — ${overall.label.toLowerCase()}. Placed against people who lift, of your sex, bodyweight and age, using published training standards. It is an estimate, not a survey of everyone.`}
            </Text>
          ) : null}
        </Card>

        <Card
          title="Achievements"
          hint={`${earnedCount} of ${ACHIEVEMENTS.length} unlocked · trophies also appear on your living-room shelf`}
        >
          {visibleAchievements.map((achievement) => {
            const earned = (achievements ?? []).includes(achievement.id);
            const art = achievement.kind === 'trophy' ? TROPHY_ART[achievement.id as TrophyId] : null;
            return (
              <View key={achievement.id} style={styles.trophyRow}>
                {art ? (
                  <Image
                    source={art}
                    resizeMode="contain"
                    // A locked trophy is shown as its own silhouette rather than
                    // hidden: you can see what is coming, but not mistake it for won.
                    style={[styles.trophyArt, !earned && styles.trophyArtLocked]}
                  />
                ) : (
                  <View style={[styles.badge, earned && styles.badgeEarned]}>
                    <Text style={[styles.badgeStar, earned && styles.badgeStarEarned]}>★</Text>
                  </View>
                )}
                <View style={styles.trophyText}>
                  <Text style={[styles.trophyName, !earned && styles.trophyNameLocked]}>
                    {achievement.title}
                  </Text>
                  <Text style={styles.trophyRule}>{achievement.describe(profile)}</Text>
                </View>
                <Text style={[styles.trophyState, earned && styles.trophyStateEarned]}>
                  {earned ? 'UNLOCKED' : 'LOCKED'}
                </Text>
              </View>
            );
          })}
          {ACHIEVEMENTS.length > ACHIEVEMENTS_PREVIEW ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showAchievements }}
              onPress={() => setShowAchievements((open) => !open)}
              hitSlop={8}
              style={styles.foldToggle}
            >
              <Text style={styles.link}>
                {showAchievements ? 'Show fewer' : `Show all ${ACHIEVEMENTS.length}`}
              </Text>
              <Text style={styles.foldChevron}>{showAchievements ? '▴' : '▾'}</Text>
            </Pressable>
          ) : null}
        </Card>

        <Card
          title="Screen time"
          hint="Stay under a budget you set and your pet's mind sharpens. Going over never costs anything."
        >
          <View style={styles.grid}>
            <Field label="Daily budget (h)" hint="optional">
              <TextInput
                style={layout.input}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.faint}
                value={budgetFields.hours}
                onChangeText={(value) => updateBudget({ ...budgetFields, hours: digits(value, true) })}
              />
            </Field>
            <Field label="(min)">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={colors.faint}
                value={budgetFields.minutes}
                onChangeText={(value) => updateBudget({ ...budgetFields, minutes: digits(value) })}
              />
            </Field>
          </View>
          {profile.screenTimeBudgetMinutes === undefined ? (
            <Text style={styles.cardHint}>No budget set — a log still counts, it just is not scored.</Text>
          ) : null}

          {screenTimeToday ? (
            <Text style={[text.body, styles.screenLogged]}>
              Logged today: {formatMinutes(screenTimeToday.metadata.minutes)}
              {screenTimeToday.metadata.withinBudget === undefined
                ? ''
                : screenTimeToday.metadata.withinBudget
                  ? ' — under budget.'
                  : ' — over budget. Tomorrow is a fresh screen.'}
            </Text>
          ) : (
            <Group label={Platform.OS === 'ios' ? 'Today · from Settings → Screen Time' : 'Today'}>
              <View style={styles.grid}>
                <NumberField label="Hours" placeholder="0" value={screenHours} onChange={setScreenHours} />
                <NumberField label="Minutes" placeholder="0" value={screenMinutes} onChange={setScreenMinutes} />
              </View>
              {screenTimeError ? <Text style={styles.saveError}>{screenTimeError}</Text> : null}
              <View style={styles.screenActions}>
                <TextButton
                  label={loggingScreenTime ? 'Logging...' : "Log today's screen time"}
                  tone="coral"
                  onPress={() => void logScreenTime()}
                  disabled={!onLogScreenTime || !canLogScreenTime || loggingScreenTime}
                />
                {screenTimeAccess ? (
                  screenTimeAccess.granted ? (
                    <TextButton
                      label={screenTimeAccess.syncing ? 'Reading...' : 'Read from this phone'}
                      onPress={() => screenTimeAccess.onSync(profile.screenTimeBudgetMinutes)}
                      disabled={screenTimeAccess.syncing}
                    />
                  ) : (
                    <TextButton label="Allow usage access" onPress={screenTimeAccess.onOpenSettings} />
                  )
                ) : null}
              </View>
              {screenTimeAccess && !screenTimeAccess.granted ? (
                <Text style={styles.cardHint}>
                  Android can read today's total for you. Vitto asks for "usage access" in Settings, keeps only the
                  total, and never sees which apps you used.
                </Text>
              ) : null}
            </Group>
          )}
        </Card>

        {reminders ? (
          <Card
            title="Reminders"
            hint="Your own notes to yourself — Vitto sends them even when it is closed."
          >
            {reminders.items.length === 0 ? (
              <Text style={styles.empty}>
                Nothing yet. Add one below, like &quot;Take creatine&quot; at 8:00 am.
              </Text>
            ) : (
              reminders.items.map((item) => (
                <View key={item.id} style={styles.reminderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reminderLabel, !item.enabled && styles.reminderOff]}>
                      {item.label}
                    </Text>
                    <Text style={styles.reminderMeta}>
                      {formatReminderTime(item.hour, item.minute)} · {describeReminderDays(item.days)}
                      {item.enabled ? '' : ' · paused'}
                    </Text>
                  </View>
                  <TextButton
                    label={item.enabled ? 'Pause' : 'Resume'}
                    onPress={() => reminders.onToggle(item.id)}
                  />
                  <TextButton label="Delete" tone="coral" onPress={() => reminders.onRemove(item.id)} />
                </View>
              ))
            )}

            <Group label="New reminder">
              <Field label="What should Vitto say?">
                <TextInput
                  style={layout.input}
                  placeholder="Take creatine"
                  placeholderTextColor={colors.faint}
                  value={reminderLabel}
                  onChangeText={setReminderLabel}
                  maxLength={60}
                />
              </Field>
              <View style={styles.grid}>
                <NumberField label="Hour (0-23)" placeholder="8" value={reminderHour} onChange={setReminderHour} />
                <NumberField label="Minute" placeholder="00" value={reminderMinute} onChange={setReminderMinute} />
              </View>
              {/* No days chosen means every day -- see `isEveryDay`. */}
              <Text style={styles.fieldHint}>
                {reminderDays.length === 0 ? 'Every day' : describeReminderDays(reminderDays)}
              </Text>
              <ChoiceRow
                options={WEEKDAYS.map((day) => ({ value: String(day), label: WEEKDAY_LABEL[day] }))}
                value={reminderDays.map(String)}
                onChange={(value) => {
                  const day = Number(value) as Weekday;
                  setReminderDays((current) =>
                    current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
                  );
                }}
              />
              {reminderMessage ? <Text style={styles.saveError}>{reminderMessage}</Text> : null}
              {reminders.permission === 'denied' ? (
                <Text style={styles.cardHint}>
                  Notifications are turned off for Vitto, so these will not appear until you allow them
                  in Settings. They are still saved.
                </Text>
              ) : null}
              <View style={styles.screenActions}>
                <TextButton
                  label={reminderBusy ? 'Saving...' : 'Add reminder'}
                  tone="coral"
                  onPress={() => void addReminder()}
                  disabled={reminderBusy}
                />
              </View>
            </Group>
          </Card>
        ) : null}

        {gym ? (
          <Card
            title="My gym"
            hint="Save where you train and your pet picks up a dumbbell whenever you open Vitto there."
          >
            <Text style={text.body}>
              {gym.saved
                ? 'Saved. Vitto checks whether you are nearby while the app is open — nothing is recorded.'
                : 'Not set. Stand at your gym and save it; only that one spot is kept, on this phone.'}
            </Text>
            {gym.error ? <Text style={styles.saveError}>{gym.error}</Text> : null}
            <View style={styles.screenActions}>
              <TextButton
                label={gym.busy ? 'Finding you...' : gym.saved ? 'Move my gym to here' : 'Set my gym to here'}
                tone="coral"
                onPress={gym.onSetHere}
                disabled={gym.busy}
              />
              {gym.saved ? <TextButton label="Forget my gym" onPress={gym.onClear} disabled={gym.busy} /> : null}
            </View>
          </Card>
        ) : null}

        <Card title="Activity history" hint="Your full record">
          {events.length === 0 ? (
            <Text style={styles.empty}>Your care history will appear here.</Text>
          ) : (
            <>
              {events.slice(0, historyLimit).map((event) =>
                event.type === 'MEAL' ? (
                  <MealDiaryRow key={event.id} event={event as HealthEvent<MealMetadata>} />
                ) : (
                  <View key={event.id} style={styles.historyRow}>
                    <View style={styles.dot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyName}>{describeEvent(event)}</Text>
                      <Text style={styles.historyTime}>
                        {new Date(event.occurredAt).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </Text>
                    </View>
                  </View>
                ),
              )}
              {events.length > historyLimit ? (
                <Pressable onPress={() => setHistoryLimit((limit) => limit + HISTORY_PAGE_SIZE)}>
                  <Text style={styles.link}>Load more →</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </Card>

        {appleHealthStatus ? (
          <View style={styles.appleHealth}>
            <Kicker>Apple Health</Kicker>
            {appleHealthStatus === 'connected' ? (
              <>
                <Text style={text.body}>
                  Connected — workouts and meals from apps like Strong or MyFitnessPal will show up here
                  automatically.
                </Text>
                <TextButton
                  label={isSyncingAppleHealth ? 'Syncing...' : 'Sync now'}
                  onPress={() => onSyncAppleHealth?.()}
                  disabled={isSyncingAppleHealth}
                />
              </>
            ) : (
              <>
                <Text style={text.body}>
                  Connect Apple Health to pull in workouts and meals you've already logged in Strong,
                  MyFitnessPal, or similar apps.
                </Text>
                <TextButton label="Connect Apple Health" onPress={() => onConnectAppleHealth?.()} />
              </>
            )}
          </View>
        ) : null}

        {onSignOut ? (
          <View style={styles.signOut}>
            <TextButton label="Log out" onPress={onSignOut} />
          </View>
        ) : null}

      </ScrollView>

      {dirty ? (
        <View style={[styles.saveBar, { paddingBottom: HOME_INDICATOR_INSET }]}>
          {error ? <Text style={styles.saveError}>{error}</Text> : null}
          <View style={styles.saveRow}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={saving ? 'Saving...' : 'Save changes'}
                busy={saving}
                onPress={() => void save()}
              />
            </View>
            <TextButton label="Discard" onPress={discard} disabled={saving} />
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
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
  settings: { justifyContent: 'flex-end' },
  body: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  reminderLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  reminderOff: { color: colors.faint },
  reminderMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 3 },
  fieldHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 10, marginBottom: 6 },
  cardHint: { fontSize: 12, color: colors.faint, marginTop: 6, lineHeight: 17 },
  cardBody: { marginTop: 4 },
  group: { marginTop: 16 },
  groupLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.faint,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', gap: 12 },
  rings: { flexDirection: 'row', gap: 6, marginTop: 10 },
  targetLine: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 14,
    lineHeight: 16,
  },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 12 },
  streakDivider: { width: 1, height: 34, backgroundColor: colors.hairline },
  streakValue: { fontSize: 28, fontWeight: '700', color: colors.ink },
  streakUnit: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 2 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  count: {
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 0,
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  countValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  record: {
    flexBasis: '30%',
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.paper,
  },
  recordEmpty: { borderStyle: 'dashed' },
  recordLift: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.faint },
  recordValue: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 6 },
  recordValueEmpty: { color: colors.faint },
  recordUnit: { fontFamily: fonts.mono, fontSize: 11, fontWeight: '400', color: colors.faint },
  recordMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  recordRank: { fontFamily: fonts.mono, fontSize: 10, color: colors.mintDeep, marginTop: 4 },
  recordFootnote: { fontSize: 11, color: colors.faint, lineHeight: 16, marginTop: 14 },
  countLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, marginTop: 3 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#eee9e1',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral },
  historyName: { fontSize: 13, fontWeight: '500', color: colors.ink },
  historyTime: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  empty: { fontSize: 13, color: colors.faint, paddingVertical: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  identityInitial: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  identityName: { fontSize: 16 },
  identityHandle: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 6 },
  identityHandleUnset: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral, marginTop: 6 },
  bio: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top', lineHeight: 19 },
  bioCount: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, marginTop: 6, lineHeight: 13 },
  link: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral, paddingVertical: 14 },
  foldToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  foldChevron: { fontSize: 12, color: colors.coral },
  appleHealth: { gap: 8, paddingVertical: 14, ...layout.hairline },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  trophyArt: { width: 40, height: 40 },
  // Badges have no art of their own: a star on a small retro tile, lit when earned.
  badge: {
    width: 40,
    height: 40,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.hairline,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEarned: { borderColor: colors.ink, backgroundColor: colors.yellow },
  badgeStar: { fontSize: 20, color: colors.faint },
  badgeStarEarned: { color: colors.yellowDeep },
  // Flattened to a grey silhouette: the shape still reads, the gold does not.
  trophyArtLocked: { opacity: 0.28, tintColor: colors.faint },
  trophyText: { flex: 1, minWidth: 0 },
  trophyName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  trophyNameLocked: { color: colors.muted },
  trophyRule: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 3, lineHeight: 14 },
  trophyState: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8, color: colors.faint },
  trophyStateEarned: { color: colors.mintDeep },
  screenLogged: { marginTop: 14 },
  screenActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, marginTop: 14 },
  signOut: { alignItems: 'center', paddingVertical: 10 },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    shadowColor: '#26312d',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
    elevation: 14,
  },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  saveError: { ...text.error, fontSize: 12, marginBottom: 10 },
});
