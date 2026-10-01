import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { BodyProfile, HealthEvent } from '@vitto/core';
import { FieldRow, FormField, SaveBar, SettingsPage, SettingsSection, TextField } from '../components/settingsKit';
import { TextButton } from '../components/ui';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { formatMinutes, joinMinutes } from '../services/minutes';
import { colors, text, themedStyles } from '../theme';

export interface ScreenTimeAccess {
  granted: boolean;
  onOpenSettings: () => void;
  onSync: (budgetMinutes?: number) => void;
  syncing?: boolean;
}

interface Props {
  profile: BodyProfile;
  events: HealthEvent[];
  /** Saves the budget, which lives on the profile. */
  onSave: (profile: BodyProfile) => Promise<void>;
  /** Logs today's total; rejects with a readable message when today is already logged. */
  onLogScreenTime?: (minutes: number, budgetMinutes?: number) => Promise<void>;
  /** Android only: the UsageStatsManager path. */
  screenTimeAccess?: ScreenTimeAccess;
  onClose: () => void;
}

/** Raw text -> number; empty stays undefined so joinMinutes can tell "blank" from "0". */
const parseField = (value: string): number | undefined => (value.trim() === '' ? undefined : Number(value));

const budgetText = (minutes: number | undefined) =>
  minutes === undefined ? { hours: '', minutes: '' } : { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) };

const digits = (value: string, decimals = false) => value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '');

/**
 * Screen time, on its own page (from Profile): the daily budget and today's
 * total. Staying under the budget sharpens the pet's mind; going over never
 * costs anything.
 */
export function ScreenTimeScreen({ profile, events, onSave, onLogScreenTime, screenTimeAccess, onClose }: Props) {
  // The budget fields hold raw text so they never re-normalise under the
  // user's fingers ("90" minutes must not flip to 1h/30m mid-entry).
  const [budgetFields, setBudgetFields] = useState(() => budgetText(profile.screenTimeBudgetMinutes));
  const [budget, setBudget] = useState(profile.screenTimeBudgetMinutes);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [today, setToday] = useState({ hours: '', minutes: '' });
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const dirty = budget !== profile.screenTimeBudgetMinutes;
  const logged = findScreenTimeForDate(events, new Date());
  const entry = joinMinutes(parseField(today.hours), parseField(today.minutes));
  // NaN (a stray second decimal point) must never reach the log button.
  const canLog = entry !== undefined && Number.isFinite(entry);

  const updateBudget = (next: { hours: string; minutes: string }) => {
    setBudgetFields(next);
    setSaveError(null);
    const joined = joinMinutes(parseField(next.hours), parseField(next.minutes));
    // Leave the budget alone while a half is unparsable; the next keystroke resolves it.
    if (joined === undefined || Number.isFinite(joined)) setBudget(joined);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ ...profile, screenTimeBudgetMinutes: budget });
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save your budget.');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setBudget(profile.screenTimeBudgetMinutes);
    setBudgetFields(budgetText(profile.screenTimeBudgetMinutes));
  };

  const log = async () => {
    if (!onLogScreenTime || !canLog) return;
    setLogging(true);
    setLogError(null);
    try {
      // The budget as shown on screen, saved or not: scoring against a number
      // the user cannot see would be baffling.
      await onLogScreenTime(entry!, budget);
      setToday({ hours: '', minutes: '' });
    } catch (cause) {
      setLogError(cause instanceof Error ? cause.message : 'Could not log screen time.');
    } finally {
      setLogging(false);
    }
  };

  return (
    <SettingsPage
      title="Screen time"
      lead="Stay under a budget you set and your pet's mind sharpens. Going over never costs anything."
      backLabel="Profile"
      onBack={onClose}
      footer={dirty ? <SaveBar saving={saving} error={saveError} onSave={() => void save()} onDiscard={discard} /> : null}
    >
      <SettingsSection
        title="Daily budget"
        description={budget === undefined ? 'No budget set. A log still counts, it just is not scored.' : `${formatMinutes(budget)} a day.`}
        first
      >
        <FieldRow>
          <FormField label="Hours">
            <TextField
              keyboardType="decimal-pad"
              placeholder="0"
              value={budgetFields.hours}
              onChangeText={(value) => updateBudget({ ...budgetFields, hours: digits(value, true) })}
              accessibilityLabel="Budget hours"
            />
          </FormField>
          <FormField label="Minutes">
            <TextField
              keyboardType="number-pad"
              placeholder="0"
              value={budgetFields.minutes}
              onChangeText={(value) => updateBudget({ ...budgetFields, minutes: digits(value) })}
              accessibilityLabel="Budget minutes"
            />
          </FormField>
        </FieldRow>
      </SettingsSection>

      <SettingsSection
        title="Today"
        description={Platform.OS === 'ios' && !logged ? 'Find it in your iPhone Settings, under Screen Time.' : undefined}
      >
        {logged ? (
          <View style={styles.logged} testID="screen-time-logged">
            <Text style={styles.loggedValue}>{formatMinutes(logged.metadata.minutes)}</Text>
            <Text style={styles.loggedVerdict}>
              {logged.metadata.withinBudget === undefined
                ? 'Logged for today.'
                : logged.metadata.withinBudget
                  ? 'Under budget. Nicely done.'
                  : 'Over budget. Tomorrow is a fresh screen.'}
            </Text>
          </View>
        ) : (
          <>
            <FieldRow>
              <FormField label="Hours">
                <TextField
                  keyboardType="number-pad"
                  placeholder="0"
                  value={today.hours}
                  onChangeText={(value) => setToday({ ...today, hours: digits(value) })}
                  accessibilityLabel="Today hours"
                />
              </FormField>
              <FormField label="Minutes">
                <TextField
                  keyboardType="number-pad"
                  placeholder="0"
                  value={today.minutes}
                  onChangeText={(value) => setToday({ ...today, minutes: digits(value) })}
                  accessibilityLabel="Today minutes"
                />
              </FormField>
            </FieldRow>
            {logError ? <Text style={styles.error}>{logError}</Text> : null}
            <View style={styles.actions}>
              <TextButton
                label={logging ? 'Logging...' : "Log today's screen time"}
                tone="coral"
                onPress={() => void log()}
                disabled={!onLogScreenTime || !canLog || logging}
              />
              {screenTimeAccess ? (
                screenTimeAccess.granted ? (
                  <TextButton
                    label={screenTimeAccess.syncing ? 'Reading...' : 'Read from this phone'}
                    onPress={() => screenTimeAccess.onSync(budget)}
                    disabled={screenTimeAccess.syncing}
                  />
                ) : (
                  <TextButton label="Allow usage access" onPress={screenTimeAccess.onOpenSettings} />
                )
              ) : null}
            </View>
            {screenTimeAccess && !screenTimeAccess.granted ? (
              <Text style={styles.hint}>
                Android can read today's total for you. Vitto asks for "usage access" in Settings, keeps only the total, and never sees
                which apps you used.
              </Text>
            ) : null}
          </>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  logged: { padding: 16, borderRadius: 16, backgroundColor: colors.cardSoft, gap: 4 },
  loggedValue: { fontSize: 28, fontWeight: '800', color: colors.ink },
  loggedVerdict: { fontSize: 14, color: colors.inkSoft },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  error: { ...text.error, fontSize: 13 },
}));
