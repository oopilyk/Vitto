import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts, themedStyles } from '../theme';

interface NutrientRingProps {
  value: number;
  label: string;
  color: string;
  percent: number;
  unit?: string;
  emphasis?: boolean;
  size?: number;
  /** Text and track colours, for a screen with its own palette (Today's day and night). */
  tone?: { ink: string; soft: string; track: string };
}

const RADIUS = 42;
const STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const VALUE_SIZE = 22;

/**
 * The number's size, so it sits inside the ring's hole whatever its length:
 * the hole's width (less a little air) over the text's width at 1pt, taking
 * San Francisco's figures at about 0.62em and a comma at 0.3em. "100" keeps
 * the full size; "2,420" steps down.
 */
export const ringValueSize = (text: string, ringSize: number): number => {
  const hole = ((2 * (RADIUS - STROKE / 2)) / 100) * ringSize * 0.84;
  const em = [...text].reduce((width, char) => width + (char === ',' || char === '.' ? 0.3 : 0.62), 0);
  return Math.min(VALUE_SIZE, Math.floor(hole / Math.max(em, 1)));
};

export function NutrientRing({
  value,
  label,
  color,
  percent,
  unit = 'kcal',
  emphasis,
  size = 104,
  tone,
}: NutrientRingProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const shown = Math.round(Math.abs(value)).toLocaleString();

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg viewBox="0 0 100 100" width={size} height={size}>
          <Circle cx="50" cy="50" r={RADIUS} stroke={tone?.track ?? colors.track} strokeWidth={STROKE} fill="none" />
          <Circle
            cx="50"
            cy="50"
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </Svg>
        <View style={styles.center}>
          <Text
            style={[styles.value, { fontSize: ringValueSize(shown, size) }, tone && { color: tone.ink }, emphasis && { color: colors.danger }]}
            numberOfLines={1}
          >
            {shown}
          </Text>
          <Text style={[styles.unit, tone && { color: tone.soft }]}>{unit}</Text>
        </View>
      </View>
      <Text style={[styles.label, tone && { color: tone.soft }]}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { alignItems: 'center', flex: 1 },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: '14%' },
  value: { fontFamily: fonts.ui, fontWeight: '600', fontSize: VALUE_SIZE, color: colors.ink, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.ui, fontSize: 11, color: colors.faint, marginTop: 1 },
  label: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 9, letterSpacing: 0 },
}));
