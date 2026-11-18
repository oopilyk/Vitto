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
import { PinnedBar, SettingsPage } from '../components/settingsKit';
import { StatGrid, StatTile } from '../components/TrendBars';
import { ErrorText, Mark, NumberInput, PrimaryButton } from '../components/ui';
import { logHaptic } from '../components/logKit';
import { askEditOrDelete } from './ActivityHistoryScreen';
import { colors, fonts, themedStyles } from '../theme';

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
/** What − and + move the weigh-in by: a scale's own last digit, in either unit. */
const STEP = 0.1;
const tenths = (value: number) => Math.round(value * 10) / 10;

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
  // Blank, with the last weigh-in as its placeholder, and − and + stepping from
  // that, so a usual morning is a tap or two rather than the whole number. Not
  // filled in: a field that already held yesterday's weight logged it again as
  // today's on a single tap, and kept doing so on every tap after.
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
      logHaptic();
      // Done: a second tap must not log it again.
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
  /** A difference already in the person's unit. */
  const signedShown = (value: number) => `${value > 0 ? '+' : '−'}${Math.abs(value)} ${unit}`;
  const when = (days: number | null) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);

  /** − and + step from what is in the field, or from the last weigh-in when it is blank. */
  const base = typed ?? (summary.latest ? show(summary.latest.kg) : undefined);
  const nudge = (direction: 1 | -1) => {
    if (base === undefined) return;
    setError(null);
    setTyped(tenths(Math.max(STEP, base + direction * STEP)));
  };

  // The line over the button: how this weigh-in compares with the last one.
  const difference = typed !== undefined && summary.latest && plausibleWeighIn(toKg(typed)) ? tenths(typed - show(summary.latest.kg)) : null;
  const footerSummary =
    difference === null ? null : difference === 0 ? 'Same as your last weigh-in' : `${signedShown(difference)} since your last weigh-in`;

  return (
    <SettingsPage
      title="Weight"
      backLabel={backLabel}
      onBack={onClose}
      footer={
        <PinnedBar>
          <ErrorText>{error}</ErrorText>
          {footerSummary ? <Text style={styles.footerSummary} numberOfLines={1}>{footerSummary}</Text> : null}
          <PrimaryButton label={saving ? 'Saving...' : 'Log weigh-in'} busy={saving} onPress={() => void log()} />
        </PinnedBar>
      }
    >
      {/* The weigh-in itself, always open: − and + either side of the number. */}
      <View style={styles.entry}>
        <Text style={styles.entryLabel}>Today</Text>
        <View style={styles.entryRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Less weight"
            accessibilityState={{ disabled: base === undefined }}
            disabled={base === undefined}
            hitSlop={6}
            onPress={() => nudge(-1)}
            style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed, base === undefined && styles.stepOff]}
          >
            <Mark kind="minus" size={12} color={colors.inkSoft} />
          </Pressable>
          <View style={styles.entryValue}>
            <NumberInput
              decimal
              style={styles.entryInput}
              value={typed}
              onValue={(value) => {
                setError(null);
                setTyped(value);
              }}
              placeholder={summary.latest ? String(show(summary.latest.kg)) : '0.0'}
              placeholderTextColor={colors.faint}
              accessibilityLabel={`Today's weight in ${unit}`}
            />
            <Text style={styles.entryUnit} numberOfLines={1}>{unit}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More weight"
            accessibilityState={{ disabled: base === undefined }}
            disabled={base === undefined}
            hitSlop={6}
            onPress={() => nudge(1)}
            style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed, base === undefined && styles.stepOff]}
          >
            <Mark kind="plus" size={12} color={colors.inkSoft} />
          </Pressable>
        </View>
        <Text style={styles.entryContext}>
          {summary.latest
            ? `Last weigh-in ${show(summary.latest.kg)} ${unit}, ${when(summary.daysSince)}`
            : 'Same time of day, same scale, is all it asks.'}
        </Text>
      </View>

      {summary.latest ? (
        <>
          <View style={styles.stats}>
            <StatGrid>
              <StatTile value={`${show(summary.latest.trendKg)} ${unit}`} label="trend weight" />
              <StatTile value={summary.change30 === null ? '—' : signed(summary.change30)} label="in 30 days" />
              {summary.toGoal !== null ? (
                <StatTile value={Math.abs(summary.toGoal) < 0.5 ? 'There' : signed(summary.toGoal)} label="to your goal" note={`Goal ${show(goalKg!)} ${unit}`} />
              ) : null}
            </StatGrid>
          </View>

          {recent.length > 1 ? (
            <>
              <Text style={styles.heading}>Trend</Text>
              <Text style={styles.caption}>Dots are weigh-ins; the line smooths out the day-to-day.</Text>
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
            </>
          ) : null}

          <Text style={styles.heading} accessibilityRole="header">Weigh-ins</Text>
          <View style={styles.list}>
            {[...entries].reverse().slice(0, 30).map((entry, index) => {
              const event = events.find((candidate) => candidate.id === entry.id)!;
              // The one before it in time (entries run oldest first), for how much it moved.
              const previous = entries[entries.length - 2 - index];
              const moved = previous ? tenths(show(entry.kg) - show(previous.kg)) : null;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityHint="Edit or delete"
                  onPress={() => askEditOrDelete(event, { onEdit: () => askNewValue(event), onDelete })}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowDate}>{new Date(entry.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                    {moved !== null ? (
                      <Text style={styles.rowMeta}>{moved === 0 ? 'No change' : `${signedShown(moved)} from the one before`}</Text>
                    ) : null}
                  </View>
                  {/* The weight stacked over its unit, right-aligned like the meal page's calories. */}
                  <View style={styles.rowFigure}>
                    <Text style={styles.rowValue} numberOfLines={1}>{show(entry.kg)}</Text>
                    <Text style={styles.rowUnit} numberOfLines={1}>{unit}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={styles.empty}>Your first weigh-in starts the line.</Text>
      )}
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  entry: {
    marginTop: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'center',
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  entryLabel: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted },
  // 10 between, not 18: two 44pt buttons and the 140pt number come to 248pt,
  // all a 320pt phone's card has; at 18 the + ran off its edge.
  entryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  entryValue: { alignItems: 'center', gap: 2 },
  // The number is the page: large, tabular so stepping doesn't make it jitter.
  entryInput: {
    minWidth: 140,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.cardSoft,
    fontFamily: fonts.ui,
    fontSize: 40,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  entryUnit: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint },
  entryContext: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stepButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cardSoft, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: colors.selectedFill },
  stepOff: { opacity: 0.35 },
  footerSummary: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSoft, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stats: { marginTop: 12 },
  heading: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 26, marginBottom: 8, paddingHorizontal: 4 },
  caption: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, marginTop: -4, marginBottom: 8, paddingHorizontal: 4 },
  empty: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, marginTop: 20, lineHeight: 21, textAlign: 'center' },
  chart: {
    height: CHART_HEIGHT,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  // One card, rows set apart by their height rather than by rules.
  list: { paddingVertical: 4, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 16 },
  rowPressed: { backgroundColor: colors.cardSoft },
  rowDate: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  rowMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 2, fontVariant: ['tabular-nums'] },
  rowFigure: { alignItems: 'flex-end', minWidth: 52, flexShrink: 0 },
  rowValue: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 17, color: colors.ink, fontVariant: ['tabular-nums'] },
  rowUnit: { fontFamily: fonts.ui, fontSize: 11, color: colors.faint },
}));
