import { useMemo } from 'react';
import { Text, View } from 'react-native';
import {
  type BodyProfile,
  type HealthEvent,
  type PetState,
  convertWeightValue,
  weeklyRecap,
} from '@vitto/core';
import { SettingsPage, SettingsSection } from '../components/settingsKit';
import { StatGrid, StatTile } from '../components/TrendBars';
import { colors, fonts, themedStyles } from '../theme';

interface Props {
  pet: PetState;
  events: readonly HealthEvent[];
  profile: BodyProfile;
  stepGoal: number;
  onClose: () => void;
  backLabel?: string;
}

const range = (start: Date, end: Date) =>
  `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

/** "+2 on last week", "same as last week", "1 fewer than last week". */
const versus = (now: number, before: number, noun = '') => {
  const diff = now - before;
  if (diff === 0) return 'same as last week';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()}${noun} on last week`;
};

/**
 * The week, the way Apple Fitness and Whoop sum one up: the last seven days
 * against the seven before, training, food, steps, water, mind and the pet's
 * growth on one page. The Sunday evening notification opens it.
 */
export function WeeklyRecapScreen({ pet, events, profile, stepGoal, onClose, backLabel = 'Today' }: Props) {
  const recap = useMemo(() => weeklyRecap(events, profile, stepGoal), [events, profile, stepGoal]);
  const unit = profile.weightUnit;
  const headline =
    recap.workouts + recap.mealDays + recap.mindSessions === 0
      ? `A quiet week. ${pet.name} is ready for the next one.`
      : `${pet.name} grew ${recap.xp.toLocaleString()} XP with you this week.`;

  return (
    <SettingsPage title="Your week" lead={range(recap.start, recap.end)} backLabel={backLabel} onBack={onClose}>
      <Text style={styles.headline} testID="weekly-headline">{headline}</Text>

      <SettingsSection title="Training" first>
        <StatGrid>
          <StatTile value={String(recap.workouts)} label={recap.workouts === 1 ? 'workout' : 'workouts'} note={versus(recap.workouts, recap.previous.workouts)} />
          <StatTile value={`${recap.workoutMinutes}`} label="minutes trained" />
        </StatGrid>
        {recap.records.length > 0 ? (
          <View style={styles.records}>
            <Text style={styles.recordsKicker}>NEW RECORDS</Text>
            <Text style={styles.recordsList}>{recap.records.join(' · ')}</Text>
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Food" description="The seven full days before today.">
        <StatGrid>
          <StatTile value={`${recap.mealDays}/7`} label="days logged" />
          <StatTile value={recap.averageCalories === null ? '—' : recap.averageCalories.toLocaleString()} label="kcal a day" note="on days you logged" />
          <StatTile value={`${recap.calorieDays}/${recap.mealDays || 7}`} label="days on target" />
          <StatTile value={`${recap.proteinDays}/${recap.mealDays || 7}`} label="days protein hit" />
        </StatGrid>
      </SettingsSection>

      <SettingsSection title="Everyday" description="Steps over the seven full days before today.">
        <StatGrid>
          <StatTile value={recap.averageSteps === null ? '—' : recap.averageSteps.toLocaleString()} label="steps a day" note={`goal hit ${recap.stepGoalDays} of 7 days`} />
          <StatTile value={`${recap.waterDays}/7`} label="days water goal" />
          <StatTile value={String(recap.mindSessions)} label="mind sessions" />
          {recap.weightChangeKg !== null ? (
            <StatTile
              value={`${recap.weightChangeKg > 0 ? '+' : recap.weightChangeKg < 0 ? '−' : ''}${Math.abs(Math.round(convertWeightValue(recap.weightChangeKg, 'kg', unit) * 10) / 10)} ${unit}`}
              label="trend weight"
            />
          ) : null}
        </StatGrid>
      </SettingsSection>

      <SettingsSection title={pet.name}>
        <StatGrid>
          <StatTile value={recap.xp.toLocaleString()} label="XP earned" note={versus(recap.xp, recap.previous.xp, ' XP')} />
        </StatGrid>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  headline: { fontFamily: fonts.ui, fontSize: 17, lineHeight: 24, color: colors.ink, marginTop: 14 },
  records: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.card },
  recordsKicker: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0.8, fontWeight: '700', color: colors.coral },
  recordsList: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 4 },
}));
