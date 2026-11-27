import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { type BodyProfile, type HealthEvent, type TrendWindow, foodTrends, foodNameText } from '@vitto/core';
import { SegmentedControl, SettingsPage, SettingsSection } from '../components/settingsKit';
import { StatGrid, StatTile, TrendBars } from '../components/TrendBars';
import { formatLocale, t, tn } from '../i18n';
import { colors, fonts, themedStyles } from '../theme';

interface Props {
  events: HealthEvent[];
  profile: BodyProfile;
  onClose: () => void;
}

const WINDOWS: { value: `${TrendWindow}`; label: string }[] = [
  { value: '7', label: t('7 days') },
  { value: '30', label: t('30 days') },
];

const kcal = (value: number) => Math.round(value).toLocaleString(formatLocale());
const changeNote = (change: number | null, window: TrendWindow) =>
  change === null ? undefined : t('{change}% vs the {days} days before', { change: `${change > 0 ? '+' : ''}${change}`, days: window });

/**
 * Food over the last week or month, from the Today card's "Trends": calories
 * a day against the target, the average day's macros, how often the targets
 * were met, the plate grades, and the meals eaten most.
 */
export function FoodTrendsScreen({ events, profile, onClose }: Props) {
  const [window, setWindow] = useState<TrendWindow>(7);
  const trends = useMemo(() => foodTrends(events, profile, window), [events, profile, window]);
  const { average, targets } = trends;
  const graded = trends.grades.A + trends.grades.B + trends.grades.C + trends.grades.D;

  return (
    <SettingsPage title={t('Food trends')} backLabel={t('Today')} onBack={onClose}>
      <SegmentedControl options={WINDOWS} value={`${window}`} onChange={(value) => setWindow(Number(value) as TrendWindow)} />

      <SettingsSection
        first
        title={t('Calories each day')}
        description={t("Against your target of {calories} kcal. Today is lighter: it isn't over yet.", { calories: kcal(targets.calories) })}
      >
        <TrendBars bars={trends.days.map((day) => ({ date: day.date, value: day.calories, isToday: day.isToday }))} goal={targets.calories} format={kcal} unit="kcal" />
      </SettingsSection>

      <SettingsSection
        title={t('Your average day')}
        description={
          average
            ? tn(trends.loggedDays, 'Over {count} logged day, not counting today or days with nothing logged.', 'Over {count} logged days, not counting today or days with nothing logged.')
            : t('Log a few days of meals and your averages show up here.')
        }
      >
        {average ? (
          <>
            <StatGrid>
              <StatTile value={kcal(average.calories)} label={t('kcal a day')} note={changeNote(trends.caloriesChange, window)} />
              <StatTile value={`${average.proteinGrams}g`} label={t('protein a day')} note={t('Target {grams}g', { grams: targets.proteinGrams })} />
              <StatTile value={`${trends.daysOnTarget}/${trends.loggedDays}`} label={t('days on calorie target')} note={t('Within 10% either way')} />
              <StatTile value={`${trends.proteinDays}/${trends.loggedDays}`} label={t('days protein hit')} note={t('90% of target or more')} />
              <StatTile value={String(average.meals)} label={t('meals a day')} />
              <StatTile value={`${average.fiberGrams}g`} label={t('fiber a day')} note={t('Target {grams}g', { grams: targets.fiberGrams })} />
            </StatGrid>
            {trends.split ? (
              <View style={styles.split}>
                <Text style={styles.splitTitle}>{t('Where the calories come from')}</Text>
                <View style={styles.splitBar}>
                  <View style={[styles.splitPart, styles.protein, { flex: trends.split.protein }]} />
                  <View style={[styles.splitPart, styles.carbs, { flex: trends.split.carbs }]} />
                  <View style={[styles.splitPart, styles.fat, { flex: trends.split.fat }]} />
                </View>
                <View style={styles.splitKey}>
                  <Key style={styles.protein} label={t('Protein {percent}%', { percent: trends.split.protein })} />
                  <Key style={styles.carbs} label={t('Carbs {percent}%', { percent: trends.split.carbs })} />
                  <Key style={styles.fat} label={t('Fat {percent}%', { percent: trends.split.fat })} />
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </SettingsSection>

      {graded > 0 ? (
        <SettingsSection title={t('Plate grades')} description={t('Every meal graded in the last {days} days.', { days: window })}>
          <View style={styles.grades}>
            {(['A', 'B', 'C', 'D'] as const).map((grade) => (
              <View key={grade} style={styles.grade}>
                <Text style={styles.gradeLetter}>{grade}</Text>
                <Text style={styles.gradeCount} numberOfLines={1}>{trends.grades[grade]}</Text>
                <View style={styles.gradeTrack}>
                  <View style={[styles.gradeFill, { width: `${(trends.grades[grade] / graded) * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </SettingsSection>
      ) : null}

      {trends.favourites.length > 0 ? (
        <SettingsSection title={t('Eaten most')} description={t('Each is one tap under Recent when you log a meal.')}>
          <View style={styles.list}>
            {trends.favourites.map((meal) => (
              <View key={meal.name} style={styles.listRow}>
                <Text style={styles.listName} numberOfLines={1}>{foodNameText(meal.name)}</Text>
                <Text style={styles.listMeta} numberOfLines={1}>
                  {meal.count}× · {kcal(meal.calories)} kcal
                </Text>
              </View>
            ))}
          </View>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

function Key({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.keyItem}>
      <View style={[styles.keyDot, style]} />
      <Text style={styles.keyLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  split: { marginTop: 18, gap: 8 },
  splitTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.ink },
  splitBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  splitPart: { height: 12 },
  protein: { backgroundColor: colors.coral },
  carbs: { backgroundColor: colors.mintDeep },
  fat: { backgroundColor: colors.yellowDeep },
  splitKey: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 10, height: 10, borderRadius: 5 },
  keyLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  grades: { gap: 10 },
  grade: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gradeLetter: { width: 18, flexShrink: 0, fontFamily: fonts.ui, fontSize: 17, fontWeight: '700', color: colors.ink },
  gradeCount: { width: 28, flexShrink: 0, fontFamily: fonts.ui, fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
  gradeTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.tile },
  gradeFill: { height: 8, borderRadius: 4, backgroundColor: colors.coral },
  list: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  listName: { flex: 1, fontFamily: fonts.ui, fontSize: 17, color: colors.ink },
  listMeta: { flexShrink: 0, fontFamily: fonts.ui, fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
}));
