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
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg viewBox="0 0 100 100" width={size} height={size}>
          <Circle cx="50" cy="50" r={RADIUS} stroke={tone?.track ?? colors.track} strokeWidth={9} fill="none" />
          <Circle
            cx="50"
            cy="50"
            r={RADIUS}
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </Svg>
        <View style={styles.center}>
          <Text style={[styles.value, tone && { color: tone.ink }, emphasis && { color: colors.danger }]}>
            {Math.round(Math.abs(value)).toLocaleString()}
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
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.pixelBold, fontSize: 26, color: colors.ink },
  unit: { fontFamily: fonts.pixel, fontSize: 12, color: colors.faint, marginTop: 1 },
  label: { fontFamily: fonts.pixel, fontSize: 13, color: colors.muted, marginTop: 9, letterSpacing: 0.5 },
}));
