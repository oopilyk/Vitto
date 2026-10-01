import { useState, type ReactNode } from 'react';
import { type LayoutChangeEvent, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ACHIEVEMENTS,
  type AchievementId,
  type BodyProfile,
  type HealthEvent,
  type Reminder,
  type TrophyId,
  BIG_LIFTS,
  calculateMacroTargets,
  calculateQualifyingStreaks,
  convertWeightValue,
  estimateCaloriesBurned,
  formatPace,
  getActiveDateKeys,
  getEventsForDay,
  getMealsForDay,
  liftStanding,
  measurementSystemOf,
  ordinal,
  overallStanding,
  personalRecords,
  runRecords,
  sumMealMacros,
} from '@vitto/core';
import { NutrientRing } from '../components/NutrientRing';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { Kicker } from '../components/ui';
import { NavGroup, NavRow } from '../components/settingsKit';
import { StrengthMap } from '../components/StrengthMap';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { formatMinutes } from '../services/minutes';
import { colors, fonts, layout } from '../theme';

interface Props {
  profile: BodyProfile;
  events: HealthEvent[];
  onClose: () => void;
  /** Opens Settings. Omitted where it is not wired up (tests). */
  onOpenSettings?: () => void;
  /** Opens Edit profile: name and bio. */
  onEditProfile?: () => void;
  /**
   * Opens the Friends screen, which owns claiming a username. Absent offline,
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
  /**
   * The tools below the stats, each a row that opens its own page. A row shows
   * only when its page is wired up; the value beside it says what is set now.
   */
  onOpenScreenTime?: () => void;
  /** The reminders, for the row's count. Absent where notifications cannot be scheduled. */
  reminders?: readonly Reminder[];
  onOpenReminders?: () => void;
  /** Whether "My gym" is saved. Absent where location cannot be read (web). */
  gymSaved?: boolean;
  onOpenGym?: () => void;
  /** Omitted entirely on platforms with no HealthKit provider (Android, web). */
  appleHealthStatus?: 'disconnected' | 'connected';
  onOpenAppleHealth?: () => void;
  onOpenHistory?: () => void;
}

/** The same art the living-room shelf uses, so the list and the shelf cannot disagree. */
const TROPHY_ART: Record<TrophyId, ReturnType<typeof require>> = {
  dumbbell: require('../../assets/trophies/dumbbell.png'),
  shoe: require('../../assets/trophies/shoe.png'),
  drumstick: require('../../assets/trophies/drumstick.png'),
  book: require('../../assets/trophies/book.png'),
};

/** Achievement rows shown before "Show all". */
const ACHIEVEMENTS_PREVIEW = 5;
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Profile: who you are and how you are doing. A header the way social apps
 * have one (avatar, headline numbers, name, bio, Edit profile), then today,
 * consistency, strength and achievements to look at. Anything you set up or
 * type into (screen time, reminders, gym, Apple Health) is a row that opens a
 * page of its own, so this page is never a form.
 */
export function ProfileScreen({
  profile,
  events,
  onClose,
  onOpenSettings,
  onEditProfile,
  onOpenFriends,
  onSignOut,
  achievements,
  onOpenScreenTime,
  reminders,
  onOpenReminders,
  gymSaved,
  onOpenGym,
  appleHealthStatus,
  onOpenAppleHealth,
  onOpenHistory,
}: Props) {
  const targets = calculateMacroTargets(profile);
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const consumed = sumMealMacros(getMealsForDay(events, today));
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;
  const streaks = calculateQualifyingStreaks(events, today);
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const runs = runRecords(events, measurementSystemOf(profile));
  // Each lift is also placed against people of the same sex, bodyweight and age.
  // `liftStanding` works in kilograms, so a pounds profile converts back first.
  const lifts = personalRecords(events, profile.weightUnit, BIG_LIFTS).map(({ exercise, record }) => ({
    exercise,
    record,
    standing: record ? liftStanding(exercise, convertWeightValue(record.weight, profile.weightUnit, 'kg'), profile) : null,
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

  const workouts = events.filter((event) => event.type === 'WORKOUT').length;
  const meals = events.filter((event) => event.type === 'MEAL').length;

  const earnedCount = ACHIEVEMENTS.filter((achievement) => (achievements ?? []).includes(achievement.id)).length;
  // Sixteen rows is most of a screen: the first few show by default and one
  // tap shows the lot.
  const [showAchievements, setShowAchievements] = useState(false);
  const visibleAchievements = showAchievements ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, ACHIEVEMENTS_PREVIEW);

  const name = profile.displayName?.trim();
  const avatarLetter = (name || profile.username || '?').slice(0, 1).toUpperCase();
  const screenTimeToday = findScreenTimeForDate(events, today);
  const screenTimeValue = [
    profile.screenTimeBudgetMinutes ? `Budget ${formatMinutes(profile.screenTimeBudgetMinutes)}` : 'No budget',
    screenTimeToday ? `${formatMinutes(screenTimeToday.metadata.minutes)} today` : 'not logged today',
  ].join(' · ');
  const activeReminders = reminders?.filter((item) => item.enabled).length ?? 0;

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Pet</Text>
        </Pressable>
        {onOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={onOpenSettings}
            hitSlop={8}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.headerButtonPressed]}
          >
            <Text style={styles.settingsLabel}>Settings</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}>
        <View style={styles.header} testID="profile-header">
          <View style={styles.headerTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{avatarLetter}</Text>
            </View>
            <View style={styles.stats}>
              <Stat value={streaks.currentStreak} label="day streak" />
              <Stat value={workouts} label="workouts" />
              <Stat value={meals} label="meals" />
            </View>
          </View>

          <View style={styles.who}>
            {name ? <Text style={styles.name}>{name}</Text> : null}
            {profile.username ? (
              <Text style={name ? styles.handle : styles.name}>{`@${profile.username}`}</Text>
            ) : onOpenFriends ? (
              <Pressable accessibilityRole="button" onPress={onOpenFriends} hitSlop={6}>
                <Text style={styles.handleLink}>Pick a username in Friends</Text>
              </Pressable>
            ) : (
              <Text style={styles.handle}>No username yet</Text>
            )}
            {profile.bio?.trim() ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : onEditProfile ? (
              <Text style={styles.bioEmpty}>No bio yet. Friends see it beside your username.</Text>
            ) : null}
          </View>

          {onEditProfile || onOpenFriends ? (
            <View style={styles.headerButtons}>
              {onEditProfile ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onEditProfile}
                  style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
                  testID="edit-profile"
                >
                  <Text style={styles.headerButtonLabel}>Edit profile</Text>
                </Pressable>
              ) : null}
              {onOpenFriends ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenFriends}
                  style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
                  testID="open-friends"
                >
                  <Text style={styles.headerButtonLabel}>Friends</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <Card title="Today">
          <View style={styles.rings}>
            <NutrientRing
              value={consumed.calories}
              percent={(consumed.calories / targets.calories) * 100}
              label="Consumed"
              color={colors.coral}
              size={88}
            />
            <NutrientRing value={burned} percent={(burned / targets.calories) * 100} label="Burned" color="#78a598" size={88} />
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
            Target {targets.calories.toLocaleString()} kcal · {targets.proteinGrams}g protein · {targets.carbsGrams}g carbs ·{' '}
            {targets.fatGrams}g fat
          </Text>
        </Card>

        <Card title="Consistency">
          <View style={styles.calendarHead}>
            <Text style={styles.calendarStreak}>
              {streaks.currentStreak === 1 ? '1 day in a row' : `${streaks.currentStreak} days in a row`}
            </Text>
            <Text style={styles.calendarLongest}>{`longest ${streaks.longestStreak}`}</Text>
          </View>
          <ActivityCalendar activeDateKeys={getActiveDateKeys(events)} />
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

        <Card title="Strength map" hint="Your strongest lifts against people your size, muscle by muscle">
          <StrengthMap profile={profile} events={events} />
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
                  <Text style={[styles.trophyName, !earned && styles.trophyNameLocked]}>{achievement.title}</Text>
                  <Text style={styles.trophyRule}>{achievement.describe(profile)}</Text>
                </View>
                <Text style={[styles.trophyState, earned && styles.trophyStateEarned]}>{earned ? 'UNLOCKED' : 'LOCKED'}</Text>
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
              <Text style={styles.link}>{showAchievements ? 'Show fewer' : `Show all ${ACHIEVEMENTS.length}`}</Text>
              <Text style={styles.foldChevron}>{showAchievements ? '▴' : '▾'}</Text>
            </Pressable>
          ) : null}
        </Card>

        <View style={styles.tools}>
          <NavGroup title="Your tools">
            {onOpenScreenTime ? (
              <NavRow title="Screen time" value={screenTimeValue} onPress={onOpenScreenTime} testID="open-screen-time" />
            ) : null}
            {reminders && onOpenReminders ? (
              <NavRow
                title="Reminders"
                value={reminders.length === 0 ? 'None yet' : `${activeReminders} of ${reminders.length} on`}
                onPress={onOpenReminders}
                testID="open-reminders"
              />
            ) : null}
            {typeof gymSaved === 'boolean' && onOpenGym ? (
              <NavRow title="My gym" value={gymSaved ? 'Saved' : 'Not set'} onPress={onOpenGym} testID="open-gym" />
            ) : null}
            {appleHealthStatus && onOpenAppleHealth ? (
              <NavRow
                title="Apple Health"
                value={appleHealthStatus === 'connected' ? 'Connected' : 'Not connected'}
                onPress={onOpenAppleHealth}
                testID="open-apple-health"
              />
            ) : null}
            {onOpenHistory ? (
              <NavRow
                title="Activity history"
                value={events.length === 0 ? 'Nothing yet' : `${events.length} care moments`}
                onPress={onOpenHistory}
                testID="open-history"
              />
            ) : null}
          </NavGroup>

          {onSignOut ? (
            <NavGroup>
              <NavRow title="Log out" onPress={onSignOut} danger testID="log-out" />
            </NavGroup>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 4,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontSize: 15, fontWeight: '500', color: colors.inkSoft },
  settingsButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  settingsLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  body: { paddingHorizontal: 16, gap: 14 },

  header: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6, gap: 14 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe7d8',
  },
  avatarInitial: { fontFamily: fonts.display, fontSize: 34, color: colors.ink },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', minWidth: 64 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  who: { gap: 2 },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink },
  handle: { fontSize: 14, color: colors.muted },
  handleLink: { fontSize: 14, fontWeight: '600', color: colors.coral },
  bio: { fontSize: 15, color: colors.inkSoft, lineHeight: 21, marginTop: 6 },
  bioEmpty: { fontSize: 15, color: colors.faint, marginTop: 6 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  headerButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonPressed: { opacity: 0.7 },
  headerButtonLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },

  calendarHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10, marginBottom: 4 },
  calendarStreak: { fontSize: 15, fontWeight: '700', color: colors.ink },
  calendarLongest: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  tools: { marginTop: -8 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
  },
  cardHint: { fontSize: 12, color: colors.faint, marginTop: 6, lineHeight: 17 },
  cardBody: { marginTop: 4 },
  rings: { flexDirection: 'row', gap: 6, marginTop: 10 },
  targetLine: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 14,
    lineHeight: 16,
  },
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
  link: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral, paddingVertical: 14 },
  foldToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  foldChevron: { fontSize: 12, color: colors.coral },
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
});
