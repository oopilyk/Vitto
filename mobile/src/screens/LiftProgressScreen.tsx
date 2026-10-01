import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import {
  type BodyProfile,
  type HealthEvent,
  type StandardLift,
  STANDARD_LIFT_LABEL,
  STRENGTH_TIERS,
  convertWeightValue,
  liftHistory,
  tierThresholdsKg,
} from '@vitto/core';
import { ChipGroup, SettingsPage } from '../components/settingsKit';
import { TIER_COLOR } from '../components/StrengthMap';
import { colors, fonts, themedStyles } from '../theme';

interface Props {
  profile: Pick<BodyProfile, 'sex' | 'weightKg' | 'weightUnit'>;
  events: readonly HealthEvent[];
  onClose: () => void;
  /** The graph and sessions are Plus. Locked, the page keeps the headline numbers and offers Plus. */
  locked?: boolean;
  onOpenPlus?: () => void;
}

const LIFTS = Object.keys(STANDARD_LIFT_LABEL) as StandardLift[];
const CHART_HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 40 };
/** Sessions listed under the chart before the rest are left to the graph. */
const SESSIONS_SHOWN = 8;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Rounds a y-axis span out to tidy gridlines (5s, 10s, 25s...). */
const niceStep = (span: number) => {
  const rough = span / 3;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((step) => step >= rough) ?? 10 * magnitude;
};

/**
 * Lift progress (from Profile's Personal records): each lift's estimated
 * one-rep max over time, one point per workout, with the next rank as a
 * dashed line to aim at. Estimated from every logged set the way the ranks
 * are, so a heavy triple counts as much as a true single.
 */
export function LiftProgressScreen({ profile, events, onClose, locked = false, onOpenPlus }: Props) {
  const histories = useMemo(
    () =>
      Object.fromEntries(LIFTS.map((lift) => [lift, liftHistory(events, lift)])) as Record<StandardLift, ReturnType<typeof liftHistory>>,
    [events],
  );
  const [lift, setLift] = useState<StandardLift>(() => LIFTS.find((option) => histories[option].length > 0) ?? 'bench');
  const [width, setWidth] = useState(0);

  const unit = profile.weightUnit;
  const show = (kg: number) => Math.round(convertWeightValue(kg, 'kg', unit));
  const points = histories[lift];
  const thresholds = tierThresholdsKg(lift, profile);
  const best = points.reduce<number | null>((top, point) => (top === null || point.oneRepMaxKg > top ? point.oneRepMaxKg : top), null);
  const tier =
    best === null ? null : thresholds.reduce<number | null>((found, threshold, index) => (best >= threshold ? index : found), null);
  const nextTier = tier === null ? 0 : tier + 1;
  const nextKg = nextTier < thresholds.length ? thresholds[nextTier]! : null;
  const latest = points.at(-1);
  const first = points[0];
  const change = latest && first && points.length > 1 ? show(latest.oneRepMaxKg) - show(first.oneRepMaxKg) : null;

  // The chart's scale, in the user's unit: the points, plus the next rank so the target line is on it.
  const values = points.map((point) => show(point.oneRepMaxKg));
  const target = nextKg === null ? null : show(nextKg);
  const lowRaw = Math.min(...values, ...(target === null ? [] : [target]));
  const highRaw = Math.max(...values, ...(target === null ? [] : [target]));
  const step = niceStep(Math.max(highRaw - lowRaw, 10));
  const low = Math.floor(lowRaw / step) * step - (lowRaw % step === 0 ? step : 0);
  const high = Math.ceil(highRaw / step) * step + (highRaw % step === 0 ? step : 0);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const start = first ? new Date(first.occurredAt).getTime() : 0;
  const end = latest ? new Date(latest.occurredAt).getTime() : 0;
  const x = (iso: string) => PAD.left + (end === start ? plotW / 2 : ((new Date(iso).getTime() - start) / (end - start)) * plotW);
  const y = (value: number) => PAD.top + (1 - (value - low) / (high - low)) * plotH;
  const ticks: number[] = [];
  for (let value = low; value <= high + 0.001; value += step) ticks.push(value);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.occurredAt)},${y(show(point.oneRepMaxKg))}`).join(' ');
  const lineColor = tier === null ? colors.coral : TIER_COLOR[tier]!;

  return (
    <SettingsPage
      title="Lift progress"
      lead="Your estimated one-rep max over time, worked out from the sets you log."
      backLabel="Profile"
      onBack={onClose}
    >
      <View style={styles.picker}>
        <ChipGroup
          scroll
          options={LIFTS.map((option) => ({ value: option, label: STANDARD_LIFT_LABEL[option] }))}
          value={lift}
          onChange={setLift}
        />
      </View>

      {points.length === 0 ? (
        <View style={styles.empty} testID="lift-progress-empty">
          <Text style={styles.emptyTitle}>{`No ${STANDARD_LIFT_LABEL[lift].toLowerCase()} logged yet`}</Text>
          <Text style={styles.emptyBody}>Log a workout with it and your first point lands here.</Text>
        </View>
      ) : (
        <>
          <View style={styles.summary} testID="lift-progress-summary">
            <View>
              <Text style={styles.summaryLabel}>Estimated max</Text>
              <Text style={styles.summaryValue}>
                {show(latest!.oneRepMaxKg)}
                <Text style={styles.summaryUnit}>{` ${unit}`}</Text>
              </Text>
              {change !== null ? (
                <Text style={[styles.change, change > 0 ? styles.changeUp : change < 0 ? styles.changeDown : null]}>
                  {`${change > 0 ? '+' : ''}${change} ${unit} since ${shortDate(first!.occurredAt)}`}
                </Text>
              ) : (
                <Text style={styles.change}>Your first session. Log more to see the trend.</Text>
              )}
            </View>
            <View style={styles.summaryRight}>
              <Text style={[styles.tierPill, { color: lineColor, borderColor: lineColor }]}>
                {tier === null ? 'Unranked' : STRENGTH_TIERS[tier]}
              </Text>
              <Text style={styles.best}>{`best ${show(best!)} ${unit}`}</Text>
            </View>
          </View>

          {locked ? (
            <View style={styles.locked} testID="lift-progress-locked">
              <Text style={styles.lockedTitle}>Your progress graph is part of Plus</Text>
              <Text style={styles.lockedBody}>
                See every lift's estimated max over time, how far you are from the next rank, and each session it came from.
              </Text>
              {onOpenPlus ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenPlus}
                  style={({ pressed }) => [styles.lockedButton, pressed && styles.pressed]}
                >
                  <Text style={styles.lockedButtonLabel}>See Plus</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <View
                style={styles.chart}
                onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
                accessibilityLabel={`${STANDARD_LIFT_LABEL[lift]} estimated max over ${points.length} sessions`}
                testID="lift-progress-chart"
              >
                {width > 0 ? (
                  <Svg width={width} height={CHART_HEIGHT}>
                    {ticks.map((value) => (
                      <Line
                        key={`g${value}`}
                        x1={PAD.left}
                        x2={width - PAD.right}
                        y1={y(value)}
                        y2={y(value)}
                        stroke={colors.hairline}
                        strokeWidth={1}
                      />
                    ))}
                    {ticks.map((value) => (
                      <SvgText
                        fontFamily={fonts.mono}
                        key={`t${value}`}
                        x={PAD.left - 8}
                        y={y(value) + 4}
                        fontSize={10}
                        fill={colors.faint}
                        textAnchor="end"
                      >
                        {String(value)}
                      </SvgText>
                    ))}
                    {target !== null ? (
                      <>
                        <Line
                          x1={PAD.left}
                          x2={width - PAD.right}
                          y1={y(target)}
                          y2={y(target)}
                          stroke={TIER_COLOR[nextTier]}
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                        />
                        <SvgText
                          fontFamily={fonts.mono}
                          x={width - PAD.right}
                          y={y(target) - 6}
                          fontSize={10}
                          fontWeight="700"
                          fill={TIER_COLOR[nextTier]}
                          textAnchor="end"
                        >
                          {`${STRENGTH_TIERS[nextTier]} ${target}`}
                        </SvgText>
                      </>
                    ) : null}
                    {points.length > 1 ? (
                      <Path d={path} stroke={lineColor} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                    ) : null}
                    {points.map((point, index) => (
                      <Circle
                        key={`${point.occurredAt}-${index}`}
                        cx={x(point.occurredAt)}
                        cy={y(show(point.oneRepMaxKg))}
                        r={index === points.length - 1 ? 5 : 3.5}
                        fill={index === points.length - 1 ? lineColor : colors.card}
                        stroke={lineColor}
                        strokeWidth={2}
                      />
                    ))}
                    <SvgText fontFamily={fonts.mono} x={PAD.left} y={CHART_HEIGHT - 8} fontSize={10} fill={colors.faint} textAnchor="start">
                      {shortDate(first!.occurredAt)}
                    </SvgText>
                    {points.length > 1 ? (
                      <SvgText
                        fontFamily={fonts.mono}
                        x={width - PAD.right}
                        y={CHART_HEIGHT - 8}
                        fontSize={10}
                        fill={colors.faint}
                        textAnchor="end"
                      >
                        {shortDate(latest!.occurredAt)}
                      </SvgText>
                    ) : null}
                  </Svg>
                ) : null}
              </View>
              {nextKg !== null ? (
                <Text style={styles.toNext}>
                  {`${Math.max(1, show(nextKg) - show(best!))} ${unit} more to `}
                  <Text style={{ color: TIER_COLOR[nextTier], fontWeight: '700' }}>{STRENGTH_TIERS[nextTier]}</Text>
                </Text>
              ) : (
                <Text style={styles.toNext}>Top rank. Nothing left to chase but your own best.</Text>
              )}

              <Text style={styles.sessionsTitle}>Sessions</Text>
              <View style={styles.sessions}>
                {[...points]
                  .reverse()
                  .slice(0, SESSIONS_SHOWN)
                  .map((point, index) => (
                    <View key={`${point.occurredAt}-${index}`} style={[styles.session, index > 0 && styles.sessionRuled]}>
                      <View style={styles.sessionText}>
                        <Text style={styles.sessionDate}>{shortDate(point.occurredAt)}</Text>
                        <Text
                          style={styles.sessionSet}
                        >{`${point.from.exercise} · ${point.from.weight} ${point.from.unit} × ${point.from.reps}`}</Text>
                      </View>
                      <Text style={styles.sessionMax}>{`${show(point.oneRepMaxKg)} ${unit}`}</Text>
                    </View>
                  ))}
              </View>
            </>
          )}
        </>
      )}
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  picker: { marginTop: 16, marginHorizontal: -24, paddingLeft: 24 },
  empty: { marginTop: 24, padding: 20, borderRadius: 16, backgroundColor: colors.cardSoft, gap: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  emptyBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  summary: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  summaryValue: { fontSize: 40, fontWeight: '800', color: colors.ink, letterSpacing: -1 },
  summaryUnit: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '400', color: colors.faint, letterSpacing: 0 },
  change: { fontSize: 14, color: colors.muted },
  changeUp: { color: colors.mintDeep, fontWeight: '600' },
  changeDown: { color: colors.caution, fontWeight: '600' },
  summaryRight: { alignItems: 'flex-end', gap: 6, paddingTop: 4 },
  tierPill: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  best: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  chart: {
    marginTop: 16,
    height: CHART_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  toNext: { fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 12 },
  locked: { marginTop: 20, padding: 20, borderRadius: 16, backgroundColor: colors.cardSoft, gap: 8 },
  lockedTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  lockedBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  lockedButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.coral,
  },
  lockedButtonLabel: { fontSize: 15, fontWeight: '700', color: colors.onCoral },
  pressed: { opacity: 0.85 },
  sessionsTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.faint,
    marginTop: 28,
    marginBottom: 8,
    marginLeft: 4,
  },
  sessions: { borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, overflow: 'hidden' },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sessionRuled: { borderTopWidth: 1, borderTopColor: colors.hairline },
  sessionText: { flex: 1, minWidth: 0 },
  sessionDate: { fontSize: 15, fontWeight: '600', color: colors.ink },
  sessionSet: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 2 },
  sessionMax: { fontSize: 15, fontWeight: '700', color: colors.ink },
}));
