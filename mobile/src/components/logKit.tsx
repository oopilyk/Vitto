import { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, fonts, themedStyles } from '../theme';

/**
 * The pieces every log page shares (meal now; workout, run and mind next), so
 * they look and feel like one system: a plate grade badge, today's progress at
 * the top that previews what this log will add, and the haptic a log lands with.
 */

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Green for a great plate through red for a poor one; white letter on all. */
const GRADE_FILL: Record<Grade, string> = {
  A: '#5f8a55',
  B: '#86a04f',
  C: '#c3963a',
  D: '#c8743d',
  F: '#a8473a',
};

export function GradeBadge({ grade, size = 34 }: { grade: Grade; size?: number }) {
  return (
    <View
      accessibilityLabel={`Grade ${grade}`}
      style={[logKit.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: GRADE_FILL[grade] ?? GRADE_FILL.C }]}
    >
      <Text style={[logKit.badgeLetter, { fontSize: Math.round(size * 0.47) }]}>{grade}</Text>
    </View>
  );
}

export interface ProgressItem {
  label: string;
  /** Already logged today. */
  value: number;
  goal: number;
  /** What the log being made would add; drawn as a lighter run after the fill. */
  adding?: number;
  unit: string;
}

const formatted = (value: number) => Math.round(value).toLocaleString('en-US');

/**
 * Today so far, with goals, at the top of a log page. Picking something to
 * log stretches each bar by what it would add, in a lighter tone, so the
 * effect of logging is visible before the button is pressed.
 */
export function LogProgress({ items }: { items: ProgressItem[] }) {
  const shown = items.filter((item) => item.goal > 0);
  if (shown.length === 0) return null;
  return (
    <View style={logKit.progress} testID="log-progress">
      {shown.map((item) => (
        <ProgressBar key={item.label} item={item} />
      ))}
    </View>
  );
}

function ProgressBar({ item }: { item: ProgressItem }) {
  const reduced = useReducedMotion();
  const share = (amount: number) => Math.max(0, Math.min(1, amount / item.goal));
  const done = share(item.value);
  const withAdding = share(item.value + (item.adding ?? 0));
  const fill = useRef(new Animated.Value(done)).current;
  const preview = useRef(new Animated.Value(withAdding)).current;
  useEffect(() => {
    if (reduced) {
      fill.setValue(done);
      preview.setValue(withAdding);
      return;
    }
    Animated.spring(fill, { toValue: done, speed: 14, bounciness: 4, useNativeDriver: false }).start();
    Animated.spring(preview, { toValue: withAdding, speed: 14, bounciness: 4, useNativeDriver: false }).start();
  }, [done, withAdding, reduced, fill, preview]);
  const adding = Math.round(item.adding ?? 0);
  const width = (value: Animated.Value) => value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View
      style={logKit.item}
      accessible
      accessibilityLabel={`${item.label}: ${formatted(item.value)} of ${formatted(item.goal)} ${item.unit}${adding > 0 ? `, plus ${adding} with this` : ''}`}
    >
      <View style={logKit.itemHead}>
        <Text style={logKit.itemLabel}>{item.label}</Text>
        <Text style={logKit.itemValue}>
          {formatted(item.value)}
          {adding > 0 ? <Text style={logKit.itemAdding}>{` +${formatted(adding)}`}</Text> : null}
          <Text style={logKit.itemGoal}>{` / ${formatted(item.goal)} ${item.unit}`}</Text>
        </Text>
      </View>
      <View style={logKit.track}>
        <Animated.View style={[logKit.preview, { width: width(preview) }]} />
        <Animated.View style={[logKit.fill, { width: width(fill) }]} />
      </View>
    </View>
  );
}

/** A log landed: the firm double tap iOS uses for success, not the light press. */
export const logHaptic = () => {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync?.(Haptics.NotificationFeedbackType?.Success)?.catch(() => undefined);
};

const logKit = themedStyles(() => ({
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeLetter: { fontFamily: fonts.ui, fontWeight: '700', color: '#fff' },
  progress: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: 22,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  item: { flex: 1, gap: 6 },
  itemHead: { gap: 1 },
  itemLabel: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted },
  itemValue: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  itemAdding: { color: colors.coral },
  itemGoal: { fontSize: 12, fontWeight: '400', color: colors.faint },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.track },
  // The coral itself at half strength: the wash tint was too close to the track to see.
  preview: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.coral, opacity: 0.45 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.coral },
}));
