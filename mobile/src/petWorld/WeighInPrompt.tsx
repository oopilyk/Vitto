import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { convertWeightValue, plausibleWeighIn, type WeightUnit } from '@vitto/core';
import { haptic, Mark, NumberInput } from '../components/ui';
import { logHaptic } from '../components/logKit';
import { fonts, world, themedStyles } from '../theme';
import { retro, retroPressed } from './retroStyle';

/**
 * The weekly weigh-in, on Home. Once a week is the right rhythm for most
 * people: daily numbers swing a kilo with water and food, and a weekly one on
 * the same day reads the trend without the noise. So it comes due seven days
 * after the last weigh-in (which keeps it on the same weekday), and shows as a
 * small pill above the room bar, opposite the mic, until it is done.
 *
 * Tapped, it opens into a card that logs it there and then: the number pad
 * up, the last few weigh-ins drawn small, last week's weight as the hint and
 * − / + a tenth at a time from it. Logged, the card says what changed since
 * last time, then goes for the week. "Remind me tomorrow" puts it off a day.
 */
export interface WeighInPromptProps {
  unit: WeightUnit;
  /** Weigh-ins oldest first, in kg, for the sparkline, the hint and "since last time". */
  recentKg: readonly { at: string; kg: number }[];
  /** Logs a weigh-in, in kg, now. */
  onLog: (kg: number) => Promise<void>;
  /** The weight page: the chart and every weigh-in. */
  onOpenChart: () => void;
}

/** A weigh-in comes due this many days after the last one. */
export const WEIGH_IN_EVERY_DAYS = 7;
const SNOOZE_KEY = 'vitto.weighin.snoozedUntil';
const DAY_MS = 86_400_000;
const tenths = (value: number) => Math.round(value * 10) / 10;
const startOfDay = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();

/** Whole days since the last weigh-in, or null before the first. */
export const daysSinceWeighIn = (recent: readonly { at: string }[], now = new Date()): number | null => {
  const last = recent.at(-1);
  return last ? Math.round((startOfDay(now) - startOfDay(new Date(last.at))) / DAY_MS) : null;
};

/** Due: never weighed in, or a week or more since. */
export const weighInDue = (recent: readonly { at: string }[], now = new Date()): boolean => {
  const days = daysSinceWeighIn(recent, now);
  return days === null || days >= WEIGH_IN_EVERY_DAYS;
};

/** The last few weigh-ins as a line, drawn small: the shape of the trend, not its numbers. */
function Sparkline({ points, night }: { points: readonly number[]; night?: boolean }) {
  const width = 92;
  const height = 30;
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((value, index) => ({
    x: 3 + (index / (points.length - 1)) * (width - 6),
    y: 3 + (1 - (value - min) / span) * (height - 6),
  }));
  const colour = night ? world.nightAccent : world.accent;
  return (
    <Svg width={width} height={height} accessible={false}>
      <Polyline points={xy.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={xy.at(-1)!.x} cy={xy.at(-1)!.y} r={3} fill={colour} />
    </Svg>
  );
}

export function WeighInPrompt({ unit, recentKg, onLog, onOpenChart, bottom, night }: WeighInPromptProps & { bottom: number; night?: boolean }) {
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Just logged: what changed, shown in the card for a moment before it goes. */
  const [result, setResult] = useState<{ value: number; delta: number | null } | null>(null);
  // The card rides up with the keyboard, at the keyboard's own pace, rather
  // than jumping when it starts to show. (Android resizes the window instead,
  // so there the card simply stays at its place above the room bar.)
  const lift = useRef(new Animated.Value(bottom)).current;
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    lift.setValue(bottom);
    if (Platform.OS !== 'ios') return undefined;
    const move = (to: number, duration?: number) =>
      Animated.timing(lift, {
        toValue: to,
        duration: duration && duration > 0 ? duration : 250,
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.77),
        useNativeDriver: false,
      }).start();
    const show = Keyboard.addListener('keyboardWillShow', (event) => {
      setKeyboardUp(true);
      move(event.endCoordinates.height + 8, event.duration);
    });
    const hide = Keyboard.addListener('keyboardWillHide', (event) => {
      setKeyboardUp(false);
      move(bottom, event.duration);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [bottom, lift]);

  useEffect(() => {
    void AsyncStorage.getItem(SNOOZE_KEY)
      .then((value) => setSnoozedUntil(value ? Number(value) : null))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(timer);
  }, [result]);

  const show = (kg: number) => tenths(convertWeightValue(kg, 'kg', unit));
  const shown = useMemo(() => recentKg.slice(-8).map((entry) => show(entry.kg)), [recentKg, unit]);
  const days = daysSinceWeighIn(recentKg);
  const due = weighInDue(recentKg);
  const snoozed = snoozedUntil !== null && Date.now() < snoozedUntil;

  if (!result && (!due || snoozed)) return null;

  const last = shown.at(-1);
  const from = typed ?? last;
  const step = (by: number) => {
    haptic('select');
    setError(null);
    setTyped(from === undefined ? undefined : tenths(from + by));
  };

  const log = async () => {
    const value = typed ?? last;
    if (value === undefined) {
      setError(`Type your weight in ${unit}.`);
      return;
    }
    const kg = convertWeightValue(value, unit, 'kg');
    if (!plausibleWeighIn(kg)) {
      setError('That weight doesn’t look right.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onLog(kg);
      logHaptic();
      Keyboard.dismiss();
      setResult({ value, delta: last === undefined ? null : tenths(value - last) });
      setTyped(undefined);
    } catch {
      setError('Could not save that. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    Keyboard.dismiss();
    setOpen(false);
  };

  const snooze = () => {
    const until = startOfDay(new Date()) + DAY_MS;
    setSnoozedUntil(until);
    Keyboard.dismiss();
    setOpen(false);
    void AsyncStorage.setItem(SNOOZE_KEY, String(until)).catch(() => undefined);
  };

  const text = [retro.label, night && retro.labelNight];
  const soft = [retro.subtle, night && retro.subtleNight];
  const ink = night ? world.nightText : world.ink;
  const overdueBy = days === null ? null : days - WEIGH_IN_EVERY_DAYS;

  // The pill: small, and says why it is there.
  if (!open && !result) {
    return (
      <View pointerEvents="box-none" style={[styles.pillWrap, { bottom }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={days === null ? 'Weekly weigh-in, start your trend' : `Weekly weigh-in, last one ${days} days ago`}
          onPress={() => {
            haptic('press');
            setOpen(true);
          }}
          style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.pill, pressed && retroPressed]}
          testID="weigh-in-pill"
        >
          <View style={[styles.dot, night && styles.dotNight]} />
          <View>
            <Text style={text}>WEIGH-IN</Text>
            <Text style={[soft, styles.pillNote]}>{days === null ? 'start your trend' : overdueBy && overdueBy > 0 ? `${days} days ago` : 'this week'}</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      {/* Behind the open card: a tap on the room puts the keyboard away, a
          second one the card, rather than poking the pet with the keys still up. */}
      {result ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={keyboardUp ? 'Hide the keyboard' : 'Close the weigh-in'}
          onPress={() => (keyboardUp ? Keyboard.dismiss() : close())}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          testID="weigh-in-backdrop"
        />
      )}
    <Animated.View pointerEvents="box-none" style={[styles.cardWrap, { bottom: lift }]}>
      <View style={[retro.panel, night && retro.panelNight, styles.card]} testID="weigh-in-card">
        {result ? (
          // Done: what changed since last time, then the card goes.
          <View style={styles.result} accessibilityLiveRegion="polite">
            <View style={[styles.tick, night && styles.tickNight]}>
              <Mark kind="check" size={14} weight={2.6} color="#fff8ec" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[text, styles.resultValue]}>{`${result.value} ${unit}`}</Text>
              <Text style={soft}>
                {result.delta === null
                  ? 'First weigh-in logged. See you next week.'
                  : result.delta === 0
                    ? 'Same as last time. See you next week.'
                    : `${result.delta < 0 ? '↓' : '↑'} ${Math.abs(result.delta)} ${unit} since last time. See you next week.`}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={text}>WEEKLY WEIGH-IN</Text>
                <Text style={soft} numberOfLines={1}>
                  {last === undefined
                    ? 'Once a week, same day, before breakfast.'
                    : `Last week ${last} ${unit}${days !== null && days > WEIGH_IN_EVERY_DAYS ? ` · ${days} days ago` : ''}`}
                </Text>
              </View>
              <Sparkline points={shown} night={night} />
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close} style={styles.close}>
                <Mark kind="cross" size={11} weight={2.2} color={ink} />
              </Pressable>
            </View>

            <View style={styles.entry}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Less, by 0.1 ${unit}`}
                disabled={from === undefined}
                onPress={() => step(-0.1)}
                style={({ pressed }) => [styles.stepper, from === undefined && styles.stepperOff, pressed && retroPressed]}
              >
                <Mark kind="minus" size={14} weight={2.4} color={world.ink} />
              </Pressable>
              <View style={[styles.fieldBox, night && styles.fieldBoxNight]}>
                <NumberInput
                  decimal
                  value={typed}
                  onValue={(next) => {
                    setTyped(next);
                    setError(null);
                  }}
                  placeholder={last !== undefined ? String(last) : '0.0'}
                  placeholderTextColor={night ? world.nightTextSoft : world.inkSoft}
                  accessibilityLabel={`This week's weight in ${unit}`}
                  autoFocus
                  selectTextOnFocus
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={() => void log()}
                  style={[styles.field, night && styles.fieldNight] as TextInput['props']['style']}
                />
                <Text style={[text, styles.unit]}>{unit}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`More, by 0.1 ${unit}`}
                disabled={from === undefined}
                onPress={() => step(0.1)}
                style={({ pressed }) => [styles.stepper, from === undefined && styles.stepperOff, pressed && retroPressed]}
              >
                <Mark kind="plus" size={14} weight={2.4} color={world.ink} />
              </Pressable>
            </View>
            {error ? <Text style={[soft, styles.error]}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log weigh-in"
              disabled={saving}
              onPress={() => void log()}
              style={({ pressed }) => [styles.log, (pressed || saving) && retroPressed]}
            >
              <Text style={[retro.label, styles.logLabel]}>
                {saving ? 'SAVING...' : typed === undefined && last !== undefined ? `LOG ${last} ${unit.toUpperCase()}` : 'LOG WEIGH-IN'}
              </Text>
            </Pressable>

            <View style={styles.links}>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onOpenChart}>
                <Text style={[soft, styles.link]}>See your trend ›</Text>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={snooze}>
                <Text style={soft}>Remind me tomorrow</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Animated.View>
    </>
  );
}

const styles = themedStyles(() => ({
  pillWrap: { position: 'absolute', left: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, paddingVertical: 6 },
  pillNote: { marginTop: 1 },
  // A small coral dot: something is waiting, as on an app icon.
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: world.accent },
  dotNight: { backgroundColor: world.nightAccent },
  cardWrap: { position: 'absolute', left: 12, right: 12 },
  backdrop: { backgroundColor: 'rgba(20,14,10,0.28)' },
  card: { padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  close: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: world.accentWash,
  },
  stepperOff: { opacity: 0.35 },
  fieldBox: {
    flex: 1,
    minWidth: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: world.ink,
    backgroundColor: '#fbf6ea',
    paddingHorizontal: 12,
  },
  fieldBoxNight: { backgroundColor: '#3a302a', borderColor: world.nightInk },
  field: {
    flex: 1,
    minWidth: 0,
    height: 52,
    fontFamily: fonts.systemMono,
    fontSize: 26,
    fontWeight: '700',
    color: world.ink,
    textAlign: 'center',
  },
  fieldNight: { color: world.nightText },
  unit: { marginLeft: 4 },
  log: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: world.accent,
  },
  logLabel: { color: '#fff8ec', fontSize: 14 },
  error: { color: world.accentDeep, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: world.accentDeep, fontWeight: '700' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  tick: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: world.positive },
  tickNight: { backgroundColor: world.positive },
  resultValue: { fontSize: 18 },
}));
