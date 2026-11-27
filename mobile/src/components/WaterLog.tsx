import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import {
  WATER_CUP_ML,
  formatWater,
  liveEvents,
  waterMlForDay,
  type HealthEvent,
  type MeasurementSystem,
} from '@vitto/core';
import { TrendBars } from './TrendBars';
import { WATER_BLUE, useWaterTaps } from './WaterTracker';
import { Mark } from './ui';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { t, tn } from '../i18n';
import { colors, fonts, layout, themedStyles } from '../theme';

/** A standard bottle: the third quick add, after one cup and two. */
const BOTTLE_ML = 500;
const GLASS_HEIGHT = 148;
const WEEK = 7;

export interface WaterLogProps {
  ml: number;
  goalMl: number;
  system: MeasurementSystem;
  onAdd: (ml: number) => Promise<void>;
  /** The whole log, for the week's chart. */
  events: readonly HealthEvent[];
  now?: Date;
}

/**
 * The Kitchen's Water page: a glass that fills toward the day's goal with
 * one-tap adds under it, and the last seven days as a chart. Taps show at
 * once and save behind the screen (useWaterTaps).
 */
export function WaterLog({ ml, goalMl, system, onAdd, events, now = new Date() }: WaterLogProps) {
  const { shown, tap } = useWaterTaps(ml, goalMl, onAdd);
  const reduced = useReducedMotion();
  const share = goalMl > 0 ? Math.min(1, shown / goalMl) : 0;
  const level = useRef(new Animated.Value(share)).current;
  useEffect(() => {
    if (reduced) level.setValue(share);
    else Animated.spring(level, { toValue: share, speed: 10, bounciness: 6, useNativeDriver: false }).start();
  }, [share, level, reduced]);

  const dayKey = now.toDateString();
  const week = useMemo(() => {
    const live = liveEvents(events);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Array.from({ length: WEEK }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (WEEK - 1 - index));
      return { date, value: waterMlForDay(live, date), isToday: index === WEEK - 1 };
    });
    return days;
    // `now` matters by day only; the key keeps the chart from rebuilding every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, dayKey]);

  // The chart's today is what is on screen, taps still saving included.
  const bars = week.map((day) => (day.isToday ? { ...day, value: shown } : day));
  const pastDays = week.slice(0, -1);
  const average = Math.round(pastDays.reduce((sum, day) => sum + day.value, 0) / pastDays.length);
  const metDays = bars.filter((day) => day.value >= goalMl).length;

  const cups = Math.round(shown / WATER_CUP_ML);
  const goalCups = Math.max(1, Math.round(goalMl / WATER_CUP_ML));
  const reached = shown >= goalMl;
  const left = Math.max(0, goalMl - shown);
  const fill = level.interpolate({ inputRange: [0, 1], outputRange: [0, GLASS_HEIGHT - 4] });

  return (
    <View style={styles.page}>
      <View style={[layout.card, styles.hero]}>
        <View style={styles.heroTop}>
          <View
            style={styles.glass}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t("Today's water")}
            accessibilityValue={{ min: 0, max: goalMl, now: Math.min(shown, goalMl), text: t('{amount} of {goal}', { amount: formatWater(shown, system), goal: formatWater(goalMl, system) }) }}
          >
            <Animated.View style={[styles.water, { height: fill }]}>
              <View style={styles.surface} />
            </Animated.View>
            {[0.25, 0.5, 0.75].map((mark) => (
              <View key={mark} pointerEvents="none" style={[styles.tick, { bottom: mark * GLASS_HEIGHT }]} />
            ))}
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>{t('Today')}</Text>
            <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
              {formatWater(shown, system)}
            </Text>
            <Text style={styles.ofGoal}>{t('of {goal}', { goal: formatWater(goalMl, system) })}</Text>
            <View style={styles.cupsLine}>
              {Array.from({ length: goalCups }, (_, index) => (
                <View key={index} style={[styles.cupDot, index < cups && styles.cupDotOn]} />
              ))}
            </View>
            <Text style={[styles.status, reached && styles.statusDone]}>
              {reached ? t('Goal reached. Nicely done!') : t('{amount} to go', { amount: formatWater(left, system) })}
            </Text>
          </View>
        </View>

        <View style={styles.adds}>
          <AddButton label={t('1 cup')} note={formatWater(WATER_CUP_ML, system)} primary onPress={() => tap(WATER_CUP_ML)} />
          <AddButton label={t('2 cups')} note={formatWater(WATER_CUP_ML * 2, system)} onPress={() => tap(WATER_CUP_ML * 2)} />
          <AddButton label={t('Bottle')} note={formatWater(BOTTLE_ML, system)} onPress={() => tap(BOTTLE_ML)} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Take back a cup of water')}
          disabled={shown <= 0}
          hitSlop={8}
          onPress={() => tap(-Math.min(WATER_CUP_ML, shown))}
          style={({ pressed }) => [styles.undo, (pressed || shown <= 0) && { opacity: 0.4 }]}
        >
          <Mark kind="minus" size={11} weight={2.2} color={colors.muted} />
          <Text style={styles.undoText}>{t('Take back a cup')}</Text>
        </Pressable>
      </View>

      <View style={[layout.card, styles.section]}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('Last 7 days')}</Text>
          <Text style={styles.sectionNote}>{t('Goal met {days} of {total}', { days: metDays, total: WEEK })}</Text>
        </View>
        <TrendBars bars={bars} goal={goalMl} format={(value) => formatWater(value, system)} unit="" color={WATER_BLUE} />
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatWater(average, system)}</Text>
            <Text style={styles.statLabel}>{t('daily average')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tn(metDays, '{count} day', '{count} days')}</Text>
            <Text style={styles.statLabel}>{t('at goal this week')}</Text>
          </View>
        </View>
      </View>

    </View>
  );
}

function AddButton({ label, note, primary, onPress }: { label: string; note: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Add {amount}, {volume}', { amount: label, volume: note })}
      onPress={onPress}
      style={({ pressed }) => [styles.add, primary && styles.addPrimary, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
    >
      <View style={styles.addHead}>
        <Mark kind="plus" size={12} weight={2.4} color={primary ? '#ffffff' : WATER_BLUE} />
        <Text style={[styles.addLabel, primary && styles.addLabelPrimary]}>{label}</Text>
      </View>
      <Text style={[styles.addNote, primary && styles.addNotePrimary]} numberOfLines={1}>
        {note}
      </Text>
    </Pressable>
  );
}

const WATER_WASH = 'rgba(91,155,196,0.14)';

const styles = themedStyles(() => ({
  page: { gap: 14 },
  hero: { padding: 18, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  glass: {
    width: 96,
    height: GLASS_HEIGHT,
    borderWidth: 2,
    borderColor: WATER_BLUE,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: WATER_WASH,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  water: { backgroundColor: WATER_BLUE },
  // The water's top edge, a shade lighter, so the level reads as a surface.
  surface: { height: 5, backgroundColor: '#8cc0e0' },
  tick: { position: 'absolute', right: 0, width: 14, height: 2, borderRadius: 1, backgroundColor: WATER_BLUE, opacity: 0.45 },
  heroCopy: { flex: 1, gap: 2 },
  kicker: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  amount: { fontFamily: fonts.ui, fontSize: 34, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  ofGoal: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
  cupsLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 12 },
  cupDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: WATER_BLUE },
  cupDotOn: { backgroundColor: WATER_BLUE },
  status: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 10 },
  statusDone: { color: WATER_BLUE, fontWeight: '600' },
  adds: { flexDirection: 'row', gap: 10 },
  add: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: WATER_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPrimary: { backgroundColor: WATER_BLUE },
  addHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  addLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: WATER_BLUE },
  addLabelPrimary: { color: '#ffffff' },
  addNote: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  addNotePrimary: { color: 'rgba(255,255,255,0.85)' },
  undo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 32 },
  undoText: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  section: { padding: 18, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '700', color: colors.ink },
  sectionNote: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.divider },
  statValue: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
}));
