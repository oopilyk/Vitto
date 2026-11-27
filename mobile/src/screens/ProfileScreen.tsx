import { useState, type ReactNode } from 'react';
import { type LayoutChangeEvent, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import {
  ACHIEVEMENTS,
  type AchievementId,
  type BodyProfile,
  type HealthEvent,
  type Reminder,
  type TrophyId,
  BIG_LIFTS,
  calculateQualifyingStreaks,
  FREEZE_EVERY_DAYS,
  MAX_FREEZES,
  convertWeightValue,
  formatPace,
  getActiveDateKeys,
  liftStanding,
  measurementSystemOf,
  ordinal,
  overallStanding,
  personalRecords,
  liftingUnit,
  careMomentCount,
  weighIns,
  runRecords,
  initialOf,
} from '@vitto/core';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { FitText } from '../components/FitText';
import { Kicker, PressableScale } from '../components/ui';
import { NavGroup, NavRow, SETTINGS_MAX_WIDTH } from '../components/settingsKit';
import { StrengthMap } from '../components/StrengthMap';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { formatMinutes } from '../services/minutes';
import { formatLocale, t, tn, tx } from '../i18n';
import { colors, fonts, layout, themedStyles } from '../theme';

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
  /** Omitted entirely on platforms with no HealthKit provider (Android, web). */
  appleHealthStatus?: 'disconnected' | 'connected';
  onOpenAppleHealth?: () => void;
  onOpenHistory?: () => void;
  /** Body weight over time (WeightScreen). */
  onOpenWeight?: () => void;
  /** Opens the graph of each lift's estimated max over time. */
  onOpenLiftProgress?: () => void;
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
  onOpen,
  openLabel,
  openText = t('More'),
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  /** Where the card sits in the scroll content -- so a deep link can scroll to it. */
  onLayout?: (event: LayoutChangeEvent) => void;
  /** Opens the card's detail page, from a "Progress ›" link at its top right. */
  onOpen?: () => void;
  /** Screen-reader name for that link. */
  openLabel?: string;
  /** What the link says. */
  openText?: string;
}) {
  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.cardHead}>
        <Kicker>{title}</Kicker>
        {onOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={openLabel ?? t('Open {title}', { title })}
            onPress={onOpen}
            hitSlop={10}
            style={({ pressed }) => [styles.cardOpen, pressed && styles.headerButtonPressed]}
          >
            {/* Words and a chevron, as every other way into a page: iOS drew
                the ↗ arrow as a blue emoji tile. */}
            <Text style={styles.cardOpenMark} numberOfLines={1}>{openText} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>{value.toLocaleString(formatLocale())}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * Profile: who you are and how you are doing. A header the way social apps
 * have one (avatar, headline numbers, name, bio, Edit profile), then
 * consistency, strength and achievements to look at (today's calories live on
 * the Today screen). Anything you set up or
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
  appleHealthStatus,
  onOpenAppleHealth,
  onOpenHistory,
  onOpenWeight,
  onOpenLiftProgress,
}: Props) {
  const today = new Date();
  const streaks = calculateQualifyingStreaks(events, today);
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(formatLocale(), { month: 'short', day: 'numeric' });
  const runs = runRecords(events, measurementSystemOf(profile));
  // Records in the unit they lift in, which can differ from their profile's (see liftingUnit).
  const liftUnit = liftingUnit(events, profile.weightUnit);
  // Each lift is also placed against people of the same sex, bodyweight and age,
  // from its best estimated one-rep max: the tile shows the set as lifted, but
  // 225 x 8 ranks as the stronger lift it is, not as a 225 single.
  // `liftStanding` works in kilograms, so pounds convert back first.
  const lifts = personalRecords(events, liftUnit, BIG_LIFTS).map(({ exercise, record, estimatedMax }) => ({
    exercise,
    record,
    standing: estimatedMax ? liftStanding(exercise, convertWeightValue(estimatedMax, liftUnit, 'kg'), profile) : null,
  }));
  const overall = overallStanding(lifts.map((lift) => lift.standing));
  const board: { label: string; value: string | null; unit?: string; meta: string; note?: string }[] = [
    ...lifts.map(({ exercise, record, standing }) => ({
      label: t(exercise),
      value: record ? String(record.weight) : null,
      unit: liftUnit,
      meta: record ? `× ${record.reps} · ${shortDate(record.occurredAt)}` : t('not yet lifted'),
      ...(standing ? { note: `${ordinal(standing.percentile)} · ${standing.label}` } : {}),
    })),
    {
      label: runs.unit === 'mi' ? t('Fastest mile') : t('Fastest km'),
      value: runs.fastest ? formatPace(runs.fastest.paceMinutes) : null,
      unit: `/${runs.unit}`,
      meta: runs.fastest ? `${runs.fastest.distance} ${runs.unit} · ${shortDate(runs.fastest.occurredAt)}` : t('no runs yet'),
    },
    {
      label: tx('the farthest distance run', 'Longest run'),
      value: runs.longest ? String(runs.longest.distance) : null,
      unit: runs.unit,
      meta: runs.longest ? `${t('{minutes} min', { minutes: runs.longest.durationMinutes })} · ${shortDate(runs.longest.occurredAt)}` : t('no runs yet'),
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
  const avatarLetter = initialOf(name || profile.username);
  const screenTimeToday = findScreenTimeForDate(events, today);
  const screenTimeValue = [
    profile.screenTimeBudgetMinutes ? t('Budget {time}', { time: formatMinutes(profile.screenTimeBudgetMinutes) }) : t('No budget'),
    screenTimeToday ? t('{time} today', { time: formatMinutes(screenTimeToday.metadata.minutes) }) : t('not logged today'),
  ].join(' · ');
  const activeReminders = reminders?.filter((item) => item.enabled).length ?? 0;

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} style={styles.back}>
          <Text style={styles.backMark}>‹</Text>
          <Text style={styles.backLabel}>{t('Pet')}</Text>
        </Pressable>
        {onOpenSettings ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('Open settings')}
            onPress={onOpenSettings}
            hitSlop={8}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.headerButtonPressed]}
          >
            <Text style={styles.settingsLabel}>{t('Settings')}</Text>
          </PressableScale>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}>
        <View style={styles.header} testID="profile-header">
          <View style={styles.headerTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{avatarLetter}</Text>
            </View>
            <View style={styles.stats}>
              <Stat value={streaks.currentStreak} label={t('day streak')} />
              <Stat value={workouts} label={t('workouts')} />
              <Stat value={meals} label={t('meals')} />
            </View>
          </View>

          <View style={styles.who}>
            {name ? <Text style={styles.name}>{name}</Text> : null}
            {profile.username ? (
              <Text style={name ? styles.handle : styles.name}>{`@${profile.username}`}</Text>
            ) : onOpenFriends ? (
              <Pressable accessibilityRole="button" onPress={onOpenFriends} hitSlop={6}>
                <Text style={styles.handleLink}>{t('Pick a username in Friends')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.handle}>{t('No username yet')}</Text>
            )}
            {profile.bio?.trim() ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : onEditProfile ? (
              <Text style={styles.bioEmpty}>{t('No bio yet. Friends see it beside your username.')}</Text>
            ) : null}
          </View>

          {onEditProfile || onOpenFriends ? (
            <View style={styles.headerButtons}>
              {onEditProfile ? (
                <PressableScale
                  accessibilityRole="button"
                  onPress={onEditProfile}
                  style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
                  testID="edit-profile"
                >
                  <Text style={styles.headerButtonLabel}>{t('Edit profile')}</Text>
                </PressableScale>
              ) : null}
              {onOpenFriends ? (
                <PressableScale
                  accessibilityRole="button"
                  onPress={onOpenFriends}
                  style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
                  testID="open-friends"
                >
                  <Text style={styles.headerButtonLabel}>{t('Friends')}</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}
        </View>

        <Card title={t('Consistency')}>
          <View style={styles.calendarHead}>
            <Text style={styles.calendarStreak} numberOfLines={1}>
              {tn(streaks.currentStreak, '{count} day in a row', '{count} days in a row')}
            </Text>
            <Text style={styles.calendarLongest} numberOfLines={1}>
              {t('longest {days}', { days: streaks.longestStreak }) + (streaks.freezes > 0 ? ` · ❄︎ ${tn(streaks.freezes, '{count} freeze', '{count} freezes')}` : '')}
            </Text>
          </View>
          <ActivityCalendar activeDateKeys={getActiveDateKeys(events)} frozenDateKeys={streaks.frozenDateKeys} />
          <Text style={styles.calendarLongest}>
            {t('Every {days} days in a row earns a streak freeze (hold up to {max}). A missed day uses one instead of ending your streak.', { days: FREEZE_EVERY_DAYS, max: MAX_FREEZES })}
          </Text>
        </Card>

        <Card
          title={t('Personal records')}
          onOpen={onOpenLiftProgress}
          openLabel={t('See lift progress')}
          openText={t('Progress')}
          hint={
            onBoard === 0
              ? t('Your best on each big lift and on the road, read from the workouts you log')
              : t('Your best on each big lift and on the road · {count} of {total} on the board', { count: onBoard, total: board.length })
          }
        >
          <View style={styles.records} accessibilityLabel={t('Personal records')}>
            {board.map(({ label, value, unit, meta, note }) => (
              <View key={label} style={[styles.record, value === null && styles.recordEmpty]}>
                <Text style={styles.recordLift} numberOfLines={2}>{label}</Text>
                <Text style={[styles.recordValue, value === null && styles.recordValueEmpty]} numberOfLines={1}>
                  {value ?? '—'}
                  {value !== null && unit ? <Text style={styles.recordUnit}> {unit}</Text> : null}
                </Text>
                <Text style={styles.recordMeta} numberOfLines={1}>{meta}</Text>
                {/* "80th · Intermediate" is wider than a tile on a 320pt phone: it shrinks a touch rather than breaking at the dot. */}
                {note ? <FitText style={styles.recordRank} minScale={0.85}>{note}</FitText> : null}
              </View>
            ))}
          </View>
          {overall ? (
            <Text style={styles.recordFootnote}>
              {t('Across your logged lifts you sit around the {percentile} percentile — {level}. Placed against people who lift, of your sex, bodyweight and age, using published training standards. It is an estimate, not a survey of everyone.', { percentile: ordinal(overall.percentile), level: overall.label.toLowerCase() })}
            </Text>
          ) : null}
        </Card>

        <Card title={t('Strength map')} hint={t('Your strongest lifts against people your size, muscle by muscle')}>
          <StrengthMap profile={profile} events={events} />
        </Card>

        <Card
          title={t('Achievements')}
          hint={t('{count} of {total} unlocked · trophies also appear on your living-room shelf', { count: earnedCount, total: ACHIEVEMENTS.length })}
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
                <Text style={[styles.trophyState, earned && styles.trophyStateEarned]} numberOfLines={1}>{earned ? t('UNLOCKED') : t('LOCKED')}</Text>
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
              <Text style={styles.link}>{showAchievements ? t('Show fewer') : t('Show all {count}', { count: ACHIEVEMENTS.length })}</Text>
              <Text style={styles.foldChevron}>{showAchievements ? '▴' : '▾'}</Text>
            </Pressable>
          ) : null}
        </Card>

        <View style={styles.tools}>
          <NavGroup title={t('Your tools')}>
            {onOpenScreenTime ? (
              <NavRow title={t('Screen time')} value={screenTimeValue} onPress={onOpenScreenTime} testID="open-screen-time" />
            ) : null}
            {reminders && onOpenReminders ? (
              <NavRow
                title={t('Reminders')}
                value={reminders.length === 0 ? t('None yet') : t('{count} of {total} on', { count: activeReminders, total: reminders.length })}
                onPress={onOpenReminders}
                testID="open-reminders"
              />
            ) : null}
            {appleHealthStatus && onOpenAppleHealth ? (
              <NavRow
                title="Apple Health"
                value={appleHealthStatus === 'connected' ? t('Connected') : t('Not connected')}
                onPress={onOpenAppleHealth}
                testID="open-apple-health"
              />
            ) : null}
            {onOpenWeight ? (
              <NavRow
                title={tx('body weight', 'Weight')}
                value={(() => {
                  const latest = weighIns(events).at(-1);
                  return latest ? `${Math.round(convertWeightValue(latest.trendKg, 'kg', profile.weightUnit) * 10) / 10} ${profile.weightUnit}` : t('Start a trend');
                })()}
                onPress={onOpenWeight}
                testID="open-weight"
              />
            ) : null}
            {onOpenHistory ? (
              <NavRow
                title={t('Activity history')}
                value={events.length === 0 ? t('Nothing yet') : tn(careMomentCount(events), '{count} log', '{count} logs')}
                onPress={onOpenHistory}
                testID="open-history"
              />
            ) : null}
          </NavGroup>

          {onSignOut ? (
            <NavGroup>
              <NavRow title={t('Log out')} onPress={onSignOut} danger testID="log-out" />
            </NavGroup>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => ({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 4,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  backMark: { fontFamily: fonts.ui, fontSize: 34, lineHeight: 36, marginTop: -4, color: colors.coral },
  backLabel: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral },
  settingsButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  settingsLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.inkSoft },
  // One readable column on a tablet, as Settings has; no change on a phone.
  body: { paddingHorizontal: 16, gap: 14, width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },

  header: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6, gap: 14 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tile,
  },
  avatarInitial: { fontFamily: fonts.ui, fontSize: 34, color: colors.ink },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  // Narrow enough that "day streak", "workouts" and "meals" sit beside the avatar on a 320pt phone.
  stat: { alignItems: 'center', minWidth: 56 },
  statValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 22, color: colors.ink },
  statLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 2 },
  who: { gap: 2 },
  name: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  handle: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted },
  handleLink: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.coral },
  bio: { fontFamily: fonts.ui, fontSize: 17, color: colors.inkSoft, lineHeight: 24, marginTop: 6 },
  bioEmpty: { fontFamily: fonts.ui, fontSize: 17, color: colors.faint, marginTop: 6 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  headerButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonPressed: { opacity: 0.7 },
  headerButtonLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },

  // The longest-streak note drops under the streak on a narrow phone rather than breaking in two.
  calendarHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  calendarStreak: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  calendarLongest: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint },
  tools: { marginTop: -8 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 18,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardOpen: { marginVertical: -6, paddingVertical: 6, flexShrink: 0 },
  cardOpenMark: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.coral, flexShrink: 0 },
  cardHint: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, marginTop: 6, lineHeight: 18 },
  cardBody: { marginTop: 4 },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  // Two to a row: at three, "× 8 · Nov 3" and "80th · Intermediate" broke across lines on every phone.
  record: {
    flexBasis: '40%',
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.paper,
  },
  recordEmpty: { borderStyle: 'dashed' },
  // Two lines' room whether or not the name wraps, so the figures in a row line up.
  recordLift: { fontFamily: fonts.ui, fontSize: 11, lineHeight: 14, minHeight: 28, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.faint },
  recordValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 22, color: colors.ink, marginTop: 6 },
  recordValueEmpty: { color: colors.faint },
  recordUnit: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '400', color: colors.faint },
  recordMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 3 },
  recordRank: { fontFamily: fonts.ui, fontSize: 12, color: colors.mintDeep, marginTop: 4 },
  recordFootnote: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, lineHeight: 17, marginTop: 14 },
  link: { fontFamily: fonts.ui, fontSize: 12, color: colors.coral, paddingVertical: 14 },
  foldToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  foldChevron: { fontFamily: fonts.ui, fontSize: 13, color: colors.coral },
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEarned: { borderColor: colors.ink, backgroundColor: colors.yellow },
  badgeStar: { fontFamily: fonts.ui, fontSize: 22, color: colors.faint },
  badgeStarEarned: { color: colors.yellowDeep },
  // Flattened to a grey silhouette: the shape still reads, the gold does not.
  trophyArtLocked: { opacity: 0.28, tintColor: colors.faint },
  trophyText: { flex: 1, minWidth: 0 },
  trophyName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  trophyNameLocked: { color: colors.muted },
  trophyRule: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 17 },
  trophyState: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0, color: colors.faint, flexShrink: 0 },
  trophyStateEarned: { color: colors.mintDeep },
}));
