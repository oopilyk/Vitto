import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { type BodyProfile, type BrainTrainingMetadata, FOCUS_AREAS, type FocusArea, type HealthEvent, type MealMetadata, calculateMacroTargets, calculateStreaks, convertHeightToFeetAndInches, convertWeightValue, estimateCaloriesBurned, feetAndInchesToCm, getActiveDateKeys, getEventsForDay, getMealsForDay, planForGoal, sumMealMacros } from '@vitto/core';
import { NutrientRing } from '../components/NutrientRing';
import { MealDiaryRow } from '../components/MealDiaryRow';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { ChoiceRow, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  profile: BodyProfile;
  events: HealthEvent[];
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
  onSignOut?: () => void;
}

const FOCUS_LABEL: Record<FocusArea, string> = {
  nutrition: 'Eat better',
  training: 'Get stronger',
  movement: 'Move more',
  mind: 'Sharpen my mind',
};

const HISTORY_PAGE_SIZE = 20;

const describeEvent = (event: HealthEvent): string => {
  if (event.type === 'WORKOUT') return 'Workout';
  if (event.type === 'STEP_ACTIVITY') return 'Steps';
  if (event.type === 'BRAIN_TRAINING') {
    const session = event.metadata as BrainTrainingMetadata;
    return `${session.game === 'math' ? 'Quick maths' : 'Read and recall'} · ${session.score} mind score`;
  }
  return 'Healthy moment';
};

export function ProfileScreen({ profile: initial, events, onSave, onClose, onSignOut }: Props) {
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);

  const update = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const metric = profile.weightUnit === 'kg';
  const toKg = (value: number) => (metric ? value : value / 2.20462);
  const displayedWeight = metric
    ? Math.round(profile.weightKg * 10) / 10
    : Math.round(convertWeightValue(profile.weightKg, 'kg', 'lb') * 10) / 10;
  const displayedTarget = profile.targetWeightKg
    ? metric
      ? Math.round(profile.targetWeightKg * 10) / 10
      : Math.round(convertWeightValue(profile.targetWeightKg, 'kg', 'lb') * 10) / 10
    : undefined;
  const displayedHeight = convertHeightToFeetAndInches(profile.heightCm);

  const targets = calculateMacroTargets(profile);
  const plan = planForGoal(profile);
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const consumed = sumMealMacros(getMealsForDay(events, today));
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;
  const streaks = calculateStreaks(events, today);
  const meals = events.filter((event) => event.type === 'MEAL').length;
  const workouts = events.filter((event) => event.type === 'WORKOUT').length;
  const mindSessions = events.filter((event) => event.type === 'BRAIN_TRAINING').length;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(profile);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Kicker>Vitto / your profile</Kicker>
            <Text style={styles.headline}>Your progress, your pace.</Text>
          </View>
          <TextButton label="Back to pet" onPress={onClose} />
        </View>

        <View style={styles.rings}>
          <NutrientRing
            value={consumed.calories}
            percent={(consumed.calories / targets.calories) * 100}
            label="Consumed"
            color={colors.coral}
            size={92}
          />
          <NutrientRing
            value={burned}
            percent={(burned / targets.calories) * 100}
            label="Burned"
            color="#78a598"
            size={92}
          />
          <NutrientRing
            value={remaining}
            percent={(Math.abs(remaining) / targets.calories) * 100}
            label={remaining < 0 ? 'Over' : 'Remaining'}
            color={remaining < 0 ? colors.danger : '#9c8dba'}
            emphasis={remaining < 0}
            size={92}
          />
        </View>

        <View style={styles.counts}>
          {[
            [meals, 'meals logged'],
            [workouts, 'workouts'],
            [mindSessions, 'mind sessions'],
            [events.length, 'care moments'],
          ].map(([value, label]) => (
            <View key={String(label)} style={styles.count}>
              <Text style={styles.countValue}>{value}</Text>
              <Text style={styles.countLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Kicker>Streaks</Kicker>
          <Text style={styles.streakValue}>
            {streaks.currentStreak} <Text style={styles.streakUnit}>day streak</Text>
          </Text>
          <Text style={styles.streakMeta}>Longest run: {streaks.longestStreak} days</Text>
          <ActivityCalendar activeDateKeys={getActiveDateKeys(events)} />
        </View>

        <View style={styles.section}>
          <Kicker>Health profile</Kicker>
          <Text style={styles.sectionHint}>Private to you · used to tune your daily fuel targets</Text>

          <View style={styles.grid}>
            <Field label="Age">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.age)}
                onChangeText={(value) => update('age', Number(value.replace(/[^0-9]/g, '')) || 0)}
              />
            </Field>
            <Field label={`Weight (${profile.weightUnit})`}>
              <TextInput
                style={layout.input}
                keyboardType="decimal-pad"
                value={String(displayedWeight)}
                onChangeText={(value) => update('weightKg', toKg(Number(value.replace(/[^0-9.]/g, '')) || 0))}
              />
            </Field>
          </View>

          <ChoiceRow
            options={[
              { value: 'kg' as const, label: 'Kilograms' },
              { value: 'lb' as const, label: 'Pounds' },
            ]}
            value={profile.weightUnit}
            onChange={(value) => update('weightUnit', value)}
          />
          <ChoiceRow
            options={[
              { value: 'cm' as const, label: 'Centimeters' },
              { value: 'ft' as const, label: 'Feet & inches' },
            ]}
            value={profile.heightUnit}
            onChange={(value) => update('heightUnit', value)}
          />

          {profile.heightUnit === 'cm' ? (
            <Field label="Height (cm)">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.heightCm)}
                onChangeText={(value) => update('heightCm', Number(value.replace(/[^0-9]/g, '')) || 0)}
              />
            </Field>
          ) : (
            <View style={styles.grid}>
              <Field label="Height (ft)">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(displayedHeight.feet)}
                  onChangeText={(value) =>
                    update(
                      'heightCm',
                      feetAndInchesToCm(Number(value.replace(/[^0-9]/g, '')) || 0, displayedHeight.inches),
                    )
                  }
                />
              </Field>
              <Field label="Height (in)">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(displayedHeight.inches)}
                  onChangeText={(value) =>
                    update(
                      'heightCm',
                      feetAndInchesToCm(displayedHeight.feet, Number(value.replace(/[^0-9]/g, '')) || 0),
                    )
                  }
                />
              </Field>
            </View>
          )}

          <Text style={styles.groupLabel}>Sex</Text>
          <ChoiceRow
            options={[
              { value: 'other' as const, label: 'Prefer not to say' },
              { value: 'female' as const, label: 'Female' },
              { value: 'male' as const, label: 'Male' },
            ]}
            value={profile.sex}
            onChange={(value) => update('sex', value)}
          />

          <Text style={styles.groupLabel}>Everyday activity</Text>
          <ChoiceRow
            options={[
              { value: 'low' as const, label: 'Mostly sitting' },
              { value: 'moderate' as const, label: 'On my feet some' },
              { value: 'high' as const, label: 'On my feet all day' },
            ]}
            value={profile.activity}
            onChange={(value) => update('activity', value)}
          />

          <Text style={styles.groupLabel}>Goal</Text>
          <ChoiceRow
            options={[
              { value: 'lose' as const, label: 'Lose fat' },
              { value: 'maintain' as const, label: 'Maintain' },
              { value: 'gain' as const, label: 'Build muscle' },
            ]}
            value={profile.goal}
            onChange={(value) => update('goal', value)}
          />

          <Text style={styles.groupLabel}>Pace</Text>
          <ChoiceRow
            options={[
              { value: 'gentle' as const, label: 'Gentle' },
              { value: 'steady' as const, label: 'Steady' },
              { value: 'focused' as const, label: 'Focused' },
            ]}
            value={profile.goalPace}
            onChange={(value) => update('goalPace', value)}
          />

          <View style={styles.grid}>
            <Field label={`Target weight (${profile.weightUnit})`} hint="optional">
              <TextInput
                style={layout.input}
                keyboardType="decimal-pad"
                placeholder="Optional"
                placeholderTextColor={colors.faint}
                value={displayedTarget === undefined ? '' : String(displayedTarget)}
                onChangeText={(value) => {
                  const digits = value.replace(/[^0-9.]/g, '');
                  update('targetWeightKg', digits === '' ? undefined : toKg(Number(digits)));
                }}
              />
            </Field>
            <Field label="Goal timeline (weeks)" hint="optional">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                placeholder="Optional"
                placeholderTextColor={colors.faint}
                value={profile.goalWeeks === undefined ? '' : String(profile.goalWeeks)}
                onChangeText={(value) => {
                  const digits = value.replace(/[^0-9]/g, '');
                  update('goalWeeks', digits === '' ? undefined : Number(digits));
                }}
              />
            </Field>
          </View>

          <View style={styles.grid}>
            <Field label="Training days / week">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.trainingDaysPerWeek)}
                onChangeText={(value) =>
                  update(
                    'trainingDaysPerWeek',
                    Math.max(0, Math.min(7, Number(value.replace(/[^0-9]/g, '')) || 0)),
                  )
                }
              />
            </Field>
          </View>

          <Text style={styles.groupLabel}>Training style</Text>
          <ChoiceRow
            options={[
              { value: 'strength' as const, label: 'Strength' },
              { value: 'cardio' as const, label: 'Cardio' },
              { value: 'mixed' as const, label: 'Both' },
            ]}
            value={profile.trainingStyle}
            onChange={(value) => update('trainingStyle', value)}
          />

          <Text style={styles.groupLabel}>What you want from Vitto</Text>
          <ChoiceRow
            stacked
            options={FOCUS_AREAS.map((area) => ({ value: area, label: FOCUS_LABEL[area] }))}
            value={profile.focusAreas}
            onChange={(area) =>
              update(
                'focusAreas',
                profile.focusAreas.includes(area)
                  ? profile.focusAreas.filter((item) => item !== area)
                  : [...profile.focusAreas, area],
              )
            }
          />

          {plan ? (
            <Text style={styles.plan}>
              {plan.totalKg} kg over {plan.achievableWeeks} weeks — {plan.kgPerWeek} kg per week,{' '}
              {Math.abs(plan.dailyAdjustment)} kcal {profile.goal === 'lose' ? 'below' : 'above'} maintenance
              {plan.capped ? ' (capped to a safe rate)' : ''}.
            </Text>
          ) : null}

          <View style={styles.saveRow}>
            <PrimaryButton
              label={saving ? 'Saving...' : saved ? 'Profile saved' : 'Save profile'}
              busy={saving}
              onPress={() => void save()}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Kicker>Activity history</Kicker>
          <Text style={styles.sectionHint}>Your full record</Text>
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
        </View>

        {onSignOut ? (
          <View style={styles.signOut}>
            <TextButton label="Log out" onPress={onSignOut} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 22, paddingTop: 70, paddingBottom: 70 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headline: { ...text.title, marginTop: 10 },
  rings: { flexDirection: 'row', gap: 8, marginTop: 26 },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 24,
  },
  count: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 14,
  },
  countValue: { fontSize: 22, fontWeight: '700', color: colors.ink },
  countLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 4 },
  section: { marginTop: 34, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 22 },
  sectionHint: { fontSize: 13, color: colors.muted, marginTop: 8 },
  streakValue: { fontSize: 30, fontWeight: '700', color: colors.ink, marginTop: 10 },
  streakUnit: { fontFamily: fonts.mono, fontSize: 12, color: colors.faint, fontWeight: '400' },
  streakMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 6 },
  grid: { flexDirection: 'row', gap: 12 },
  groupLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.faint,
    marginTop: 20,
    textTransform: 'uppercase',
  },
  plan: {
    marginTop: 18,
    padding: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#84a08a',
    backgroundColor: '#eef3ec',
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  saveRow: { marginTop: 24 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e2db',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral },
  historyName: { fontSize: 13, fontWeight: '500', color: colors.ink },
  historyTime: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  empty: { fontSize: 13, color: colors.faint, paddingVertical: 14 },
  link: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral, paddingVertical: 14 },
  signOut: { marginTop: 30, alignItems: 'center' },
});
