import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { type BodyProfile, type HealthEvent, type TrendWindow, foodTrends } from '@vitto/core';
import { SegmentedControl, SettingsPage, SettingsSection } from '../components/settingsKit';
import { StatGrid, StatTile, TrendBars } from '../components/TrendBars';
import { colors, fonts, themedStyles } from '../theme';

interface Props {
  events: HealthEvent[];
  profile: BodyProfile;
  onClose: () => void;
}

const WINDOWS: { value: `${TrendWindow}`; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
];

const kcal = (value: number) => Math.round(value).toLocaleString();
const changeNote = (change: number | null, window: TrendWindow) =>
  change === null ? undefined : `${change > 0 ? '+' : ''}${change}% vs the ${window} days before`;

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
  const over = `${trends.loggedDays} logged ${trends.loggedDays === 1 ? 'day' : 'days'}`;

  return (
    <SettingsPage title="Food trends" backLabel="Today" onBack={onClose}>
      <SegmentedControl options={WINDOWS} value={`${window}`} onChange={(value) => setWindow(Number(value) as TrendWindow)} />

      <SettingsSection
        first
        title="Calories each day"
        description={`Against your target of ${kcal(targets.calories)} kcal. Today is lighter: it isn't over yet.`}
      >
        <TrendBars bars={trends.days.map((day) => ({ date: day.date, value: day.calories, isToday: day.isToday }))} goal={targets.calories} format={kcal} unit="kcal" />
      </SettingsSection>

      <SettingsSection
        title="Your average day"
        description={average ? `Over ${over}, not counting today or days with nothing logged.` : 'Log a few days of meals and your averages show up here.'}
      >
        {average ? (
          <>
            <StatGrid>
              <StatTile value={kcal(average.calories)} label="kcal a day" note={changeNote(trends.caloriesChange, window)} />
              <StatTile value={`${average.proteinGrams}g`} label="protein a day" note={`Target ${targets.proteinGrams}g`} />
              <StatTile value={`${trends.daysOnTarget}/${trends.loggedDays}`} label="days on calorie target" note="Within 10% either way" />
              <StatTile value={`${trends.proteinDays}/${trends.loggedDays}`} label="days protein hit" note="90% of target or more" />
              <StatTile value={String(average.meals)} label="meals a day" />
              <StatTile value={`${average.fiberGrams}g`} label="fiber a day" note={`Target ${targets.fiberGrams}g`} />
            </StatGrid>
            {trends.split ? (
              <View style={styles.split}>
                <Text style={styles.splitTitle}>Where the calories come from</Text>
                <View style={styles.splitBar}>
                  <View style={[styles.splitPart, styles.protein, { flex: trends.split.protein }]} />
                  <View style={[styles.splitPart, styles.carbs, { flex: trends.split.carbs }]} />
                  <View style={[styles.splitPart, styles.fat, { flex: trends.split.fat }]} />
                </View>
                <View style={styles.splitKey}>
                  <Key style={styles.protein} label={`Protein ${trends.split.protein}%`} />
                  <Key style={styles.carbs} label={`Carbs ${trends.split.carbs}%`} />
                  <Key style={styles.fat} label={`Fat ${trends.split.fat}%`} />
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </SettingsSection>

      {graded > 0 ? (
        <SettingsSection title="Plate grades" description={`Every meal graded in the last ${window} days.`}>
          <View style={styles.grades}>
            {(['A', 'B', 'C', 'D'] as const).map((grade) => (
              <View key={grade} style={styles.grade}>
                <Text style={styles.gradeLetter}>{grade}</Text>
                <Text style={styles.gradeCount}>{trends.grades[grade]}</Text>
                <View style={styles.gradeTrack}>
                  <View style={[styles.gradeFill, { width: `${(trends.grades[grade] / graded) * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </SettingsSection>
      ) : null}

      {trends.favourites.length > 0 ? (
        <SettingsSection title="Eaten most" description="Each is one tap under Recent when you log a meal.">
          <View style={styles.list}>
            {trends.favourites.map((meal) => (
              <View key={meal.name} style={styles.listRow}>
                <Text style={styles.listName} numberOfLines={1}>{meal.name}</Text>
                <Text style={styles.listMeta}>
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
  gradeLetter: { width: 18, fontFamily: fonts.ui, fontSize: 17, fontWeight: '700', color: colors.ink },
  gradeCount: { width: 28, fontFamily: fonts.ui, fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
  gradeTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.tile },
  gradeFill: { height: 8, borderRadius: 4, backgroundColor: colors.coral },
  list: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  listName: { flex: 1, fontFamily: fonts.ui, fontSize: 17, color: colors.ink },
  listMeta: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
}));
