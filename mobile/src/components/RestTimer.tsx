import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from './ui';
import { colors, fonts, themedStyles } from '../theme';

/** A rest between sets, in epoch ms. */
export interface Rest {
  startedAt: number;
  endsAt: number;
  /** The exercise it follows, for the Island and the alert. */
  label: string;
}

/** Where a rest starts: the usual gap between working sets. */
export const DEFAULT_REST_MS = 90_000;
/** What −15 / +15 move it by. */
export const REST_STEP_MS = 15_000;

export const formatRest = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

interface Props {
  rest: Rest;
  onAdjust: (deltaMs: number) => void;
  onSkip: () => void;
  /** The rest ran out with the screen open. */
  onDone: () => void;
}

/**
 * The countdown pinned over the workout's footer while resting: how long is
 * left, a bar running down, and −15 / +15 / Skip. It buzzes when time is up.
 * With the phone locked, the alert and the Island take over (services/restTimer).
 */
export function RestTimer({ rest, onAdjust, onSkip, onDone }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const left = rest.endsAt - now;
  useEffect(() => {
    if (left > 0) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync?.(Haptics.NotificationFeedbackType?.Success)?.catch(() => undefined);
    onDone();
  }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const span = Math.max(1, rest.endsAt - rest.startedAt);
  const fraction = Math.max(0, Math.min(1, left / span));

  return (
    <View style={styles.wrap} testID="rest-timer" accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label} numberOfLines={2}>
            Rest · {rest.label}
          </Text>
          <Text style={styles.clock} accessibilityLabel={`${formatRest(left)} of rest left`}>
            {formatRest(left)}
          </Text>
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel="15 seconds less rest" onPress={() => onAdjust(-REST_STEP_MS)} hitSlop={4} style={styles.step}>
          <Text style={styles.stepLabel}>−15</Text>
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel="15 seconds more rest" onPress={() => onAdjust(REST_STEP_MS)} hitSlop={4} style={styles.step}>
          <Text style={styles.stepLabel}>+15</Text>
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel="Skip rest" onPress={onSkip} hitSlop={4} style={[styles.step, styles.skip]}>
          <Text style={[styles.stepLabel, styles.skipLabel]}>Skip</Text>
        </PressableScale>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: colors.coralWash,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', color: colors.coralDeep },
  clock: {
    fontFamily: fonts.ui,
    fontSize: 28,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  step: {
    minWidth: 48,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  stepLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  skip: { backgroundColor: colors.coral },
  skipLabel: { color: colors.onCoral },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.card },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.coral },
}));
