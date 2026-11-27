import { useMemo } from 'react';
import { Text, View } from 'react-native';
import {
  type BodyProfile,
  type HealthEvent,
  type PetState,
  convertWeightValue,
  petJournal,
  weeklyRecap,
} from '@vitto/core';
import { SettingsPage, SettingsSection } from '../components/settingsKit';
import { StatGrid, StatTile } from '../components/TrendBars';
import { formatLocale, t, tn } from '../i18n';
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
  t('{start} – {end}', {
    start: start.toLocaleDateString(formatLocale(), { month: 'short', day: 'numeric' }),
    end: end.toLocaleDateString(formatLocale(), { month: 'short', day: 'numeric' }),
  });

/** "+2 on last week", "same as last week", "1 fewer than last week". */
const versus = (now: number, before: number, xp = false) => {
  const diff = now - before;
  if (diff === 0) return t('same as last week');
  const change = `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString(formatLocale())}`;
  return xp ? t('{change} XP on last week', { change }) : t('{change} on last week', { change });
};

/**
 * The week, the way Apple Fitness and Whoop sum one up: the last seven days
 * against the seven before, training, food, steps, water, mind and the pet's
 * growth on one page. The Sunday evening notification opens it.
 */
export function WeeklyRecapScreen({ pet, events, profile, stepGoal, onClose, backLabel = t('Today') }: Props) {
  const recap = useMemo(() => weeklyRecap(events, profile, stepGoal), [events, profile, stepGoal]);
  const unit = profile.weightUnit;
  const journal = useMemo(() => petJournal(pet, recap), [pet, recap]);
  const headline =
    recap.workouts + recap.mealDays + recap.mindSessions === 0
      ? t('A quiet week. {pet} is ready for the next one.', { pet: pet.name })
      : t('{pet} grew {xp} XP with you this week.', { pet: pet.name, xp: recap.xp.toLocaleString(formatLocale()) });

  return (
    <SettingsPage title={t('Your week')} lead={range(recap.start, recap.end)} backLabel={backLabel} onBack={onClose}>
      {/* The pet's own account of the week leads: how it is, what it made of
          the week, what it thinks of you. The numbers follow. */}
      <View style={styles.journal} testID="pet-journal">
        <Text style={styles.journalKicker}>{t("{pet}'S JOURNAL", { pet: pet.name.toUpperCase() })}</Text>
        <Text style={styles.journalText}>{t('{status} {week}', { status: journal.status, week: journal.week })}</Text>
        <Text style={[styles.journalText, styles.journalOwner]}>{journal.owner}</Text>
        <Text style={styles.journalSign}>{t('— {pet}', { pet: pet.name })}</Text>
      </View>
      <Text style={styles.headline} testID="weekly-headline">{headline}</Text>

      <SettingsSection title={t('Training')} first>
        <StatGrid>
          <StatTile value={String(recap.workouts)} label={tn(recap.workouts, 'workout', 'workouts')} note={versus(recap.workouts, recap.previous.workouts)} />
          <StatTile value={`${recap.workoutMinutes}`} label={t('minutes trained')} />
        </StatGrid>
        {recap.records.length > 0 ? (
          <View style={styles.records}>
            <Text style={styles.recordsKicker}>{t('NEW RECORDS')}</Text>
            <Text style={styles.recordsList}>{recap.records.join(' · ')}</Text>
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('Food')} description={t('The seven full days before today.')}>
        <StatGrid>
          <StatTile value={`${recap.mealDays}/7`} label={t('days logged')} />
          <StatTile value={recap.averageCalories === null ? '—' : recap.averageCalories.toLocaleString(formatLocale())} label={t('kcal a day')} note={t('on days you logged')} />
          <StatTile value={`${recap.calorieDays}/${recap.mealDays || 7}`} label={t('days on target')} />
          <StatTile value={`${recap.proteinDays}/${recap.mealDays || 7}`} label={t('days protein hit')} />
        </StatGrid>
      </SettingsSection>

      <SettingsSection title={t('Everyday')} description={t('Steps over the seven full days before today.')}>
        <StatGrid>
          <StatTile value={recap.averageSteps === null ? '—' : recap.averageSteps.toLocaleString(formatLocale())} label={t('steps a day')} note={t('goal hit {days} of 7 days', { days: recap.stepGoalDays })} />
          <StatTile value={`${recap.waterDays}/7`} label={t('days water goal')} />
          <StatTile value={String(recap.mindSessions)} label={t('mind sessions')} />
          {recap.weightChangeKg !== null ? (
            <StatTile
              value={`${recap.weightChangeKg > 0 ? '+' : recap.weightChangeKg < 0 ? '−' : ''}${Math.abs(Math.round(convertWeightValue(recap.weightChangeKg, 'kg', unit) * 10) / 10)} ${unit}`}
              label={t('trend weight')}
            />
          ) : null}
        </StatGrid>
      </SettingsSection>

      <SettingsSection title={pet.name}>
        <StatGrid>
          <StatTile value={recap.xp.toLocaleString(formatLocale())} label={t('XP earned')} note={versus(recap.xp, recap.previous.xp, true)} />
        </StatGrid>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  journal: { marginTop: 14, padding: 16, gap: 8, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.card },
  journalKicker: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 0.6, color: colors.muted },
  journalText: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 23, color: colors.ink },
  journalOwner: { fontWeight: '600' },
  journalSign: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted, textAlign: 'right' },
  headline: { fontFamily: fonts.ui, fontSize: 17, lineHeight: 24, color: colors.ink, marginTop: 14 },
  records: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.card },
  recordsKicker: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0.8, fontWeight: '700', color: colors.coral },
  recordsList: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 4 },
}));
