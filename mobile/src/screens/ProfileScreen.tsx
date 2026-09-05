import { useMemo, useState, type ReactNode } from 'react';
import {
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
  type BodyProfile,
  type BrainTrainingMetadata,
  FOCUS_AREAS,
  type FocusArea,
  type HealthEvent,
  type MealMetadata,
  type PetBreed,
  calculateMacroTargets,
  calculateStreaks,
  convertHeightToFeetAndInches,
  convertWeightValue,
  estimateCaloriesBurned,
  feetAndInchesToCm,
  getActiveDateKeys,
  getEventsForDay,
  getMealsForDay,
  planForGoal,
  sumMealMacros,
} from '@vitto/core';
import { NutrientRing } from '../components/NutrientRing';
import { MealDiaryRow } from '../components/MealDiaryRow';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { BreedPicker } from '../components/BreedPicker';
import { ChoiceRow, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  profile: BodyProfile;
  breed: PetBreed | undefined;
  onBreedChange: (breed: PetBreed) => void;
  events: HealthEvent[];
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
  onSignOut?: () => void;
  /** Omitted for a signed-out/local-only session -- friends require an account. */
  onOpenFriends?: () => void;
  /** Omitted entirely on platforms with no HealthKit provider (Android, web). */
  appleHealthStatus?: 'disconnected' | 'connected';
  onConnectAppleHealth?: () => void;
  onSyncAppleHealth?: () => void;
  isSyncingAppleHealth?: boolean;
}

const FOCUS_LABEL: Record<FocusArea, string> = {
  nutrition: 'Eat better',
  training: 'Get stronger',
  movement: 'Move more',
  mind: 'Sharpen my mind',
};

const HISTORY_PAGE_SIZE = 20;
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

const describeEvent = (event: HealthEvent): string => {
  if (event.type === 'WORKOUT') return 'Workout';
  if (event.type === 'STEP_ACTIVITY') return 'Steps';
  if (event.type === 'BRAIN_TRAINING') {
    const session = event.metadata as BrainTrainingMetadata;
    return `${session.game === 'math' ? 'Quick maths' : 'Read and recall'} · ${session.score} mind score`;
  }
  return 'Healthy moment';
};

/** A titled card. Grouping the form this way keeps any one screenful readable. */
function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
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
  breed,
  onBreedChange,
  events,
  onSave,
  onClose,
  onSignOut,
  onOpenFriends,
  appleHealthStatus,
  onConnectAppleHealth,
  onSyncAppleHealth,
  isSyncingAppleHealth,
}: Props) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);

  // Drives the save bar: it only appears once something actually differs.
  const dirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(initial),
    [profile, initial],
  );

  const update = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const metric = profile.weightUnit === 'kg';
  const toKg = (value: number) => (metric ? value : value / 2.20462);
  const round = (value: number) => Math.round(value * 10) / 10;
  const displayedWeight = metric ? round(profile.weightKg) : round(convertWeightValue(profile.weightKg, 'kg', 'lb'));
  const displayedTarget = profile.targetWeightKg
    ? metric
      ? round(profile.targetWeightKg)
      : round(convertWeightValue(profile.targetWeightKg, 'kg', 'lb'))
    : undefined;
  const displayedHeight = convertHeightToFeetAndInches(profile.heightCm);
  const digits = (value: string, decimals = false) =>
    value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '');

  const targets = calculateMacroTargets(profile);
  const plan = planForGoal(profile);
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const consumed = sumMealMacros(getMealsForDay(events, today));
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;
  const streaks = calculateStreaks(events, today);
  const counts = [
    [events.filter((event) => event.type === 'MEAL').length, 'meals logged'],
    [events.filter((event) => event.type === 'WORKOUT').length, 'workouts'],
    [events.filter((event) => event.type === 'BRAIN_TRAINING').length, 'mind sessions'],
    [events.length, 'care moments'],
  ] as const;

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

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Pet</Text>
        </Pressable>
        <Text style={styles.topTitle}>Profile</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: (dirty ? 110 : 40) + HOME_INDICATOR_INSET }]}
        keyboardShouldPersistTaps="handled"
      >
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

        <Card title="Your companion" hint="Changes take effect straight away">
          <BreedPicker value={breed} onChange={onBreedChange} size={88} />
        </Card>

        <Card title="About you" hint="Private to you · used to tune your daily fuel targets">
          <View style={styles.grid}>
            <Field label="Age">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.age)}
                onChangeText={(value) => update('age', Number(digits(value)) || 0)}
              />
            </Field>
            <Field label={`Weight (${profile.weightUnit})`}>
              <TextInput
                style={layout.input}
                keyboardType="decimal-pad"
                value={String(displayedWeight)}
                onChangeText={(value) => update('weightKg', toKg(Number(digits(value, true)) || 0))}
              />
            </Field>
          </View>

          {profile.heightUnit === 'cm' ? (
            <Field label="Height (cm)">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.heightCm)}
                onChangeText={(value) => update('heightCm', Number(digits(value)) || 0)}
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
                    update('heightCm', feetAndInchesToCm(Number(digits(value)) || 0, displayedHeight.inches))
                  }
                />
              </Field>
              <Field label="Height (in)">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(displayedHeight.inches)}
                  onChangeText={(value) =>
                    update('heightCm', feetAndInchesToCm(displayedHeight.feet, Number(digits(value)) || 0))
                  }
                />
              </Field>
            </View>
          )}

          <Group label="Units">
            <View style={styles.unitRow}>
              <ChoiceRow
                options={[
                  { value: 'kg' as const, label: 'kg' },
                  { value: 'lb' as const, label: 'lb' },
                ]}
                value={profile.weightUnit}
                onChange={(value) => update('weightUnit', value)}
              />
              <ChoiceRow
                options={[
                  { value: 'cm' as const, label: 'cm' },
                  { value: 'ft' as const, label: 'ft & in' },
                ]}
                value={profile.heightUnit}
                onChange={(value) => update('heightUnit', value)}
              />
            </View>
          </Group>

          <Group label="Sex">
            <ChoiceRow
              options={[
                { value: 'other' as const, label: 'Prefer not to say' },
                { value: 'female' as const, label: 'Female' },
                { value: 'male' as const, label: 'Male' },
              ]}
              value={profile.sex}
              onChange={(value) => update('sex', value)}
            />
          </Group>
        </Card>

        <Card title="Your goal" hint="Sets how far your daily calories sit from maintenance">
          <ChoiceRow
            options={[
              { value: 'lose' as const, label: 'Lose fat' },
              { value: 'maintain' as const, label: 'Maintain' },
              { value: 'gain' as const, label: 'Build muscle' },
            ]}
            value={profile.goal}
            onChange={(value) => update('goal', value)}
          />

          {profile.goal !== 'maintain' ? (
            <>
              <View style={styles.grid}>
                <Field label={`Target (${profile.weightUnit})`} hint="optional">
                  <TextInput
                    style={layout.input}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.faint}
                    value={displayedTarget === undefined ? '' : String(displayedTarget)}
                    onChangeText={(value) => {
                      const next = digits(value, true);
                      update('targetWeightKg', next === '' ? undefined : toKg(Number(next)));
                    }}
                  />
                </Field>
                <Field label="Timeline (weeks)" hint="optional">
                  <TextInput
                    style={layout.input}
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor={colors.faint}
                    value={profile.goalWeeks === undefined ? '' : String(profile.goalWeeks)}
                    onChangeText={(value) => {
                      const next = digits(value);
                      update('goalWeeks', next === '' ? undefined : Number(next));
                    }}
                  />
                </Field>
              </View>

              {plan ? (
                <View style={styles.plan}>
                  <Text style={styles.planText}>
                    {plan.totalKg} kg over {plan.achievableWeeks} weeks —{' '}
                    <Text style={styles.planValue}>{plan.kgPerWeek} kg</Text> per week,{' '}
                    <Text style={styles.planValue}>{Math.abs(plan.dailyAdjustment)} kcal</Text>{' '}
                    {profile.goal === 'lose' ? 'below' : 'above'} maintenance.
                  </Text>
                  {plan.capped ? (
                    <Text style={styles.planWarning}>Capped to a safe rate.</Text>
                  ) : null}
                </View>
              ) : (
                <Group label="Pace">
                  <ChoiceRow
                    options={[
                      { value: 'gentle' as const, label: 'Gentle' },
                      { value: 'steady' as const, label: 'Steady' },
                      { value: 'focused' as const, label: 'Focused' },
                    ]}
                    value={profile.goalPace}
                    onChange={(value) => update('goalPace', value)}
                  />
                </Group>
              )}
            </>
          ) : null}
        </Card>

        <Card title="Your training" hint="Training days lift calories; lifting raises protein">
          <Group label="Everyday activity">
            <ChoiceRow
              options={[
                { value: 'low' as const, label: 'Mostly sitting' },
                { value: 'moderate' as const, label: 'On my feet some' },
                { value: 'high' as const, label: 'On my feet all day' },
              ]}
              value={profile.activity}
              onChange={(value) => update('activity', value)}
            />
          </Group>
          <Field label="Training days per week">
            <TextInput
              style={[layout.input, styles.narrowInput]}
              keyboardType="number-pad"
              value={String(profile.trainingDaysPerWeek)}
              onChangeText={(value) =>
                update('trainingDaysPerWeek', Math.max(0, Math.min(7, Number(digits(value)) || 0)))
              }
            />
          </Field>
          <Group label="Style">
            <ChoiceRow
              options={[
                { value: 'strength' as const, label: 'Strength' },
                { value: 'cardio' as const, label: 'Cardio' },
                { value: 'mixed' as const, label: 'Both' },
              ]}
              value={profile.trainingStyle}
              onChange={(value) => update('trainingStyle', value)}
            />
          </Group>
        </Card>

        <Card title="What you want from Vitto" hint="Your dashboard leads with these">
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
        </Card>

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

        {onOpenFriends ? (
          <View style={styles.friends}>
            <Kicker>Friends</Kicker>
            <Text style={text.body}>Add friends by username and see how their pets are doing.</Text>
            <TextButton label="Open friends" onPress={onOpenFriends} />
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
            <TextButton label="Discard" onPress={() => setProfile(initial)} disabled={saving} />
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
  body: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
  },
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
  narrowInput: { maxWidth: 120 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
  countLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, marginTop: 3 },
  plan: {
    marginTop: 16,
    padding: 13,
    borderRadius: 12,
    backgroundColor: '#eef3ec',
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.35)',
  },
  planText: { fontSize: 12, lineHeight: 19, color: colors.inkSoft },
  planValue: { fontWeight: '700', color: colors.ink },
  planWarning: { fontFamily: fonts.mono, fontSize: 10, color: '#9a6b5c', marginTop: 6 },
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
  link: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral, paddingVertical: 14 },
  appleHealth: { gap: 8, paddingVertical: 14, ...layout.hairline },
  friends: { gap: 8, paddingVertical: 14, ...layout.hairline },
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
