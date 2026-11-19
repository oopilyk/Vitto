import { useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { WATER_CUP_ML, formatWater, type MeasurementSystem } from '@vitto/core';
import { Mark } from './ui';
import { colors, fonts, themedStyles } from '../theme';

/**
 * Today's water, Cronometer-style: a row of cups that fill as the day's water
 * comes in, with − and + either side to take a cup back or add one. Whole cups
 * only. Past the target the cups just stay full.
 *
 * A tap shows at once, with a buzz: the cups move before the save does. Saves
 * run one at a time behind the screen, each against the log the one before it
 * left, so a quick run of taps is counted exactly once each. A save that fails
 * takes its cup back off the screen (the app's error banner says why).
 */
export function WaterTracker({
  ml,
  goalMl,
  system,
  onAdd,
  ink = colors.ink,
  soft = colors.muted,
  divider,
  large,
}: {
  ml: number;
  goalMl: number;
  system: MeasurementSystem;
  onAdd: (ml: number) => Promise<void>;
  ink?: string;
  soft?: string;
  /** A hairline above the tracker in this colour, where it follows other rows (Today's Food card). */
  divider?: string;
  /** Bigger cups and buttons, where the tracker is the whole page (the Kitchen's Water tab). */
  large?: boolean;
}) {
  /** Taps on screen but not yet saved, in mL. */
  const [pending, setPending] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The latest handler, so a queued save sees the log as the save before it left it.
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;

  const shown = Math.max(0, ml + pending);
  const cups = Math.max(1, Math.round(goalMl / WATER_CUP_ML));
  // Whole cups: water logged before the tracker was cups-only rounds to the nearest.
  const full = Math.round(shown / WATER_CUP_ML);

  const tap = (amount: number) => {
    if (amount === 0) return;
    setPending((current) => current + amount);
    buzz(amount > 0 && shown < goalMl && shown + amount >= goalMl ? 'goal' : 'tap');
    queue.current = queue.current.then(async () => {
      // Let the previous save's new log reach this component before the next one reads it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        await onAddRef.current(amount);
      } catch {
        buzz('error');
      } finally {
        setPending((current) => current - amount);
      }
    });
  };

  return (
    <View style={[styles.water, divider ? { borderTopWidth: 1, borderTopColor: divider, marginTop: 8, paddingTop: 12 } : null, large && styles.waterLarge]}>
      <View style={styles.waterHead}>
        <Text style={[styles.waterLabel, large && styles.waterLabelLarge, { color: soft }]}>Water</Text>
        <Text style={[styles.waterCount, large && styles.waterCountLarge, { color: ink }]}>
          {formatWater(shown, system)}
          <Text style={[styles.waterTarget, { color: soft }]}> / {formatWater(goalMl, system)}</Text>
        </Text>
      </View>
      <View style={styles.waterCupsRow}>
        <WaterStep
          large={large}
          sign="−"
          label="Remove a cup of water"
          disabled={shown <= 0}
          onPress={() => tap(-Math.min(WATER_CUP_ML, shown))}
        />
        <View style={styles.waterCups}>
          {Array.from({ length: cups }, (_, index) => (
            <WaterCup key={index} full={index < full} large={large} />
          ))}
        </View>
        <WaterStep large={large} sign="+" label="Add a cup of water" onPress={() => tap(WATER_CUP_ML)} />
      </View>
      <Text style={[styles.waterHint, large && styles.waterHintLarge, { color: soft }]}>
        1 cup = {formatWater(WATER_CUP_ML, system)}
      </Text>
    </View>
  );
}

/** The water tracker's buzz: a light tick per cup, a success on the goal. */
const buzz = (kind: 'tap' | 'goal' | 'error') => {
  if (Platform.OS === 'web') return;
  const done =
    kind === 'tap'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === 'goal' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
        );
  void done.catch(() => {});
};

/** One cup on the water row: a tapered glass, full of water or empty. */
function WaterCup({ full, large }: { full: boolean; large?: boolean }) {
  return (
    <Svg width={large ? 30 : 22} height={large ? 41 : 30} viewBox="0 0 22 30">
      <Path
        d="M2 3 L20 3 L18 27 L4 27 Z"
        fill={full ? WATER_BLUE : 'none'}
        stroke={WATER_BLUE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The − and + either side of the cups. */
function WaterStep({
  sign,
  label,
  onPress,
  disabled,
  large,
}: {
  large?: boolean;
  sign: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.waterStep,
        large && styles.waterStepLarge,
        pressed && { backgroundColor: WATER_BLUE },
        disabled && { opacity: 0.35 },
      ]}
    >
      {({ pressed }) => <Mark kind={sign === '+' ? 'plus' : 'minus'} size={large ? 16 : 12} weight={2.2} color={pressed ? '#fff' : WATER_BLUE} />}
    </Pressable>
  );
}

const WATER_BLUE = '#5b9bc4';

const styles = themedStyles(() => ({
  water: { gap: 10 },
  waterLarge: { gap: 16 },
  waterHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  waterLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  waterLabelLarge: { fontSize: 13 },
  waterCount: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13 },
  waterCountLarge: { fontSize: 20, fontWeight: '700' },
  waterTarget: { fontWeight: '400', fontSize: 13 },
  waterCupsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waterCups: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  waterStep: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: WATER_BLUE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterStepLarge: { width: 46, height: 46, borderRadius: 15, borderWidth: 1.5 },
  waterHint: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0, textAlign: 'center', marginTop: -4 },
  waterHintLarge: { fontSize: 13, marginTop: -2 },
}));
