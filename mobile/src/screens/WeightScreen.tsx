import { useEffect, useMemo, useState } from 'react';
import { Alert, type LayoutChangeEvent, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import {
  type HealthEvent,
  type WeightUnit,
  convertWeightValue,
  plausibleWeighIn,
  weighIns,
  weightSummary,
} from '@vitto/core';
import { SettingsPage, SettingsSection } from '../components/settingsKit';
import { StatGrid, StatTile } from '../components/TrendBars';
import { NumberInput, PrimaryButton } from '../components/ui';
import { askEditOrDelete } from './ActivityHistoryScreen';
import { colors, fonts, layout, themedStyles } from '../theme';

interface Props {
  events: readonly HealthEvent[];
  unit: WeightUnit;
  goalKg?: number;
  /** Logs a weigh-in, in kg, now. */
  onLog: (kg: number) => Promise<void>;
  onEdit: (event: HealthEvent, kg: number) => Promise<void>;
  onDelete: (event: HealthEvent) => void;
  onClose: () => void;
  /** A weigh-in to change as soon as the page opens (from Activity history). */
  editId?: string;
  backLabel?: string;
}

const CHART_HEIGHT = 200;
const PAD = { top: 14, right: 12, bottom: 26, left: 40 };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Body weight over time: log today's, see the trend. Each weigh-in is a dot
 * and the trend a line through them, so a day's swing reads as the noise it
 * is. The goal from onboarding is the dashed line the trend heads for.
 */
export function WeightScreen({ events, unit, goalKg, onLog, onEdit, onDelete, onClose, editId, backLabel = 'Back' }: Props) {
  const entries = useMemo(() => weighIns(events as HealthEvent[]), [events]);
  const summary = weightSummary(entries, goalKg);
  const show = (kg: number) => Math.round(convertWeightValue(kg, 'kg', unit) * 10) / 10;
  const toKg = (value: number) => convertWeightValue(value, unit, 'kg');
  const [typed, setTyped] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const askNewValue = (event: HealthEvent) => {
    const current = show((event.metadata as { kg: number }).kg);
    const save = (text?: string) => {
      const value = Number((text ?? '').replace(',', '.'));
      if (!plausibleWeighIn(toKg(value))) {
        setError('That weight doesn’t look right.');
        return;
      }
      void onEdit(event, toKg(value));
    };
    if (Platform.OS === 'ios') Alert.prompt('Edit weigh-in', `In ${unit}`, save, 'plain-text', String(current), 'decimal-pad');
  };

  useEffect(() => {
    if (!editId) return;
    const event = events.find((candidate) => candidate.id === editId);
    if (event) askNewValue(event);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const log = async () => {
    if (typed === undefined || !plausibleWeighIn(toKg(typed))) {
      setError(`Type your weight in ${unit}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onLog(toKg(typed));
      setTyped(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that weigh-in.');
    } finally {
      setSaving(false);
    }
  };

  // The chart: the last 90 days of weigh-ins in the person's unit.
  const recent = entries.filter((entry) => Date.parse(entry.at) >= Date.now() - 90 * 86_400_000);
  const values = [...recent.flatMap((entry) => [show(entry.kg), show(entry.trendKg)]), ...(goalKg ? [show(goalKg)] : [])];
  const low = Math.floor(Math.min(...values) - 1);
  const high = Math.ceil(Math.max(...values) + 1);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const start = recent[0] ? Date.parse(recent[0].at) : 0;
  const end = recent.at(-1) ? Date.parse(recent.at(-1)!.at) : 0;
  const x = (iso: string) => PAD.left + (end === start ? plotW / 2 : ((Date.parse(iso) - start) / (end - start)) * plotW);
  const y = (value: number) => PAD.top + (1 - (value - low) / Math.max(1, high - low)) * plotH;
  const trendPath = recent.map((entry, index) => `${index === 0 ? 'M' : 'L'}${x(entry.at)},${y(show(entry.trendKg))}`).join(' ');

  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(show(value))} ${unit}`;

  return (
    <SettingsPage title="Weight" lead="Weigh in when you like; the trend line smooths out the day-to-day." backLabel={backLabel} onBack={onClose}>
      <View style={styles.logRow}>
        <NumberInput
          decimal
          style={[layout.input, styles.logInput]}
          value={typed}
          onValue={setTyped}
          placeholder={summary.latest ? String(show(summary.latest.kg)) : unit}
          placeholderTextColor={colors.faint}
          accessibilityLabel={`Today's weight in ${unit}`}
        />
        <Text style={styles.logUnit}>{unit}</Text>
        <View style={styles.logButton}>
          <PrimaryButton label={saving ? 'Saving...' : 'Log weigh-in'} busy={saving} onPress={() => void log()} />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {summary.latest ? (
        <>
          <StatGrid>
            <StatTile value={`${show(summary.latest.trendKg)} ${unit}`} label="trend weight" note={`last weighed ${summary.daysSince === 0 ? 'today' : summary.daysSince === 1 ? 'yesterday' : `${summary.daysSince} days ago`}`} />
            <StatTile value={summary.change30 === null ? '—' : signed(summary.change30)} label="in 30 days" />
            {summary.toGoal !== null ? (
              <StatTile value={Math.abs(summary.toGoal) < 0.5 ? 'There' : signed(summary.toGoal)} label="to your goal" note={`Goal ${show(goalKg!)} ${unit}`} />
            ) : null}
          </StatGrid>

          {recent.length > 1 ? (
            <View
              style={styles.chart}
              onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
              accessibilityLabel={`Weight trend over ${recent.length} weigh-ins`}
            >
              {width > 0 ? (
                <Svg width={width} height={CHART_HEIGHT}>
                  {[low, Math.round((low + high) / 2), high].map((value) => (
                    <SvgText key={value} fontFamily={fonts.mono} x={PAD.left - 8} y={y(value) + 4} fontSize={10} fill={colors.faint} textAnchor="end">
                      {String(value)}
                    </SvgText>
                  ))}
                  {goalKg ? (
                    <Line x1={PAD.left} x2={width - PAD.right} y1={y(show(goalKg))} y2={y(show(goalKg))} stroke={colors.mintDeep} strokeWidth={1.5} strokeDasharray="5 4" />
                  ) : null}
                  {recent.map((entry) => (
                    <Circle key={entry.id} cx={x(entry.at)} cy={y(show(entry.kg))} r={3} fill={colors.coralWash} stroke={colors.coral} strokeWidth={1} />
                  ))}
                  <Path d={trendPath} stroke={colors.coral} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  <SvgText fontFamily={fonts.mono} x={PAD.left} y={CHART_HEIGHT - 8} fontSize={10} fill={colors.faint}>
                    {shortDate(recent[0]!.at)}
                  </SvgText>
                  <SvgText fontFamily={fonts.mono} x={width - PAD.right} y={CHART_HEIGHT - 8} fontSize={10} fill={colors.faint} textAnchor="end">
                    {shortDate(recent.at(-1)!.at)}
                  </SvgText>
                </Svg>
              ) : null}
            </View>
          ) : null}

          <SettingsSection title="Weigh-ins">
            <View style={styles.list}>
              {[...entries].reverse().slice(0, 30).map((entry, index) => {
                const event = events.find((candidate) => candidate.id === entry.id)!;
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityHint="Edit or delete"
                    onPress={() => askEditOrDelete(event, { onEdit: () => askNewValue(event), onDelete })}
                    style={({ pressed }) => [styles.row, index > 0 && styles.rowRuled, pressed && styles.pressed]}
                  >
                    <Text style={styles.rowDate}>{new Date(entry.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                    <Text style={styles.rowValue}>{`${show(entry.kg)} ${unit}`}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SettingsSection>
        </>
      ) : (
        <Text style={styles.empty}>Your first weigh-in starts the line. Same time of day, same scale, is all it asks.</Text>
      )}
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 6 },
  logInput: { width: 96 },
  logUnit: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted },
  logButton: { flex: 1 },
  error: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger, marginBottom: 6 },
  empty: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, marginTop: 20, lineHeight: 21 },
  chart: {
    marginTop: 16,
    height: CHART_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  list: { borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, paddingHorizontal: 16 },
  rowRuled: { borderTopWidth: 1, borderTopColor: colors.hairline },
  pressed: { opacity: 0.6 },
  rowDate: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  rowValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
}));
