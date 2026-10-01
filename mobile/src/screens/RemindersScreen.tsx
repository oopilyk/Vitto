import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  type Reminder,
  type Weekday,
  WEEKDAYS,
  WEEKDAY_LABEL,
  describeReminderDays,
  errorMessage,
  formatReminderTime,
  reminderError,
} from '@vitto/core';
import { FieldRow, FormField, SettingsPage, SettingsSection, TextField } from '../components/settingsKit';
import { ChoiceRow, TextButton } from '../components/ui';
import { colors, fonts, text, themedStyles } from '../theme';

export interface RemindersProps {
  items: Reminder[];
  permission: string;
  onAdd: (draft: { label: string; hour: number; minute: number; days: Weekday[] }) => Promise<void>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

const digits = (value: string) => value.replace(/[^0-9]/g, '');
const parse = (value: string): number | undefined => (value === '' ? undefined : Number(value));

/**
 * The user's own reminders ("take my creatine at 8am"), on their own page
 * (from Profile): what is set, then a composer for a new one. Vitto sends them
 * even when it is closed.
 */
export function RemindersScreen({ reminders, onClose }: { reminders: RemindersProps; onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [hour, setHour] = useState('8');
  const [minute, setMinute] = useState('0');
  const [days, setDays] = useState<Weekday[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const add = async () => {
    const draft = { label, hour: parse(hour) ?? -1, minute: parse(minute) ?? 0, days };
    const problem = reminderError(draft, reminders.items.length);
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    try {
      await reminders.onAdd(draft);
      setLabel('');
      setDays([]);
      setMessage(null);
    } catch (cause) {
      setMessage(errorMessage(cause, 'Could not save that reminder.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage
      title="Reminders"
      lead="Your own notes to yourself. Vitto sends them even when it is closed."
      backLabel="Profile"
      onBack={onClose}
    >
      {reminders.permission === 'denied' ? (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Notifications are turned off for Vitto, so these will not appear until you allow them in Settings. They are still saved.
          </Text>
        </View>
      ) : null}

      <SettingsSection title="Your reminders" first>
        {reminders.items.length === 0 ? (
          <Text style={styles.empty}>Nothing yet. Add one below, like "Take creatine" at 8:00 am.</Text>
        ) : (
          <View style={styles.list}>
            {reminders.items.map((item, index) => (
              <View key={item.id} style={[styles.row, index > 0 && styles.rowRuled]}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, !item.enabled && styles.rowOff]}>{item.label}</Text>
                  <Text style={styles.rowMeta}>
                    {formatReminderTime(item.hour, item.minute)} · {describeReminderDays(item.days)}
                    {item.enabled ? '' : ' · paused'}
                  </Text>
                </View>
                <TextButton label={item.enabled ? 'Pause' : 'Resume'} onPress={() => reminders.onToggle(item.id)} />
                <TextButton label="Delete" tone="coral" onPress={() => reminders.onRemove(item.id)} />
              </View>
            ))}
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="New reminder">
        <FormField label="What should Vitto say?">
          <TextField placeholder="Take creatine" value={label} onChangeText={setLabel} maxLength={60} returnKeyType="done" />
        </FormField>
        <FieldRow>
          <FormField label="Hour" hint="0-23">
            <TextField keyboardType="number-pad" placeholder="8" value={hour} onChangeText={(value) => setHour(digits(value))} />
          </FormField>
          <FormField label="Minute">
            <TextField keyboardType="number-pad" placeholder="00" value={minute} onChangeText={(value) => setMinute(digits(value))} />
          </FormField>
        </FieldRow>
        {/* No days chosen means every day -- see `isEveryDay`. */}
        <FormField label="Days" hint={days.length === 0 ? 'Every day' : describeReminderDays(days)}>
          <ChoiceRow
            options={WEEKDAYS.map((day) => ({ value: String(day), label: WEEKDAY_LABEL[day] }))}
            value={days.map(String)}
            onChange={(value) => {
              const day = Number(value) as Weekday;
              setDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));
            }}
          />
        </FormField>
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <View style={styles.actions}>
          <TextButton label={busy ? 'Saving...' : 'Add reminder'} tone="coral" onPress={() => void add()} disabled={busy} />
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  warning: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.dangerWash, borderWidth: 1, borderColor: colors.dangerBorder },
  warningText: { fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
  empty: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  list: { borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 60 },
  rowRuled: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.ink },
  rowOff: { color: colors.faint },
  rowMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  error: { ...text.error, fontSize: 13 },
}));
