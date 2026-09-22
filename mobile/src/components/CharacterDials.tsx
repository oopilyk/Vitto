import { Pressable, StyleSheet, Text, View } from 'react-native';
import { companion } from '@vitto/core';
import { colors, fonts } from '../theme';

type DialKey = companion.DialKey;
type PersonalityDials = companion.PersonalityDials;

/**
 * Seven stops per dial. A tap row rather than a drag slider: it works the same
 * on web and on a phone, needs no dependency, is reachable by screen reader one
 * stop at a time, and seven is fine enough that "quite" and "extremely" (see
 * `describeDials`) are separate stops.
 */
const STOPS = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1] as const;
const nearestStop = (value: number): number =>
  STOPS.reduce((best, stop) => (Math.abs(stop - value) < Math.abs(best - value) ? stop : best), STOPS[0]);

/**
 * The five character sliders, between two words each. Values are 0..1; the
 * words come from the same table the prompt uses, so what the person sees is
 * what the pet is told.
 */
export function CharacterDials({
  dials,
  onChange,
  testID,
}: {
  dials: PersonalityDials;
  onChange: (next: PersonalityDials) => void;
  testID?: string;
}) {
  return (
    <View style={styles.wrap} testID={testID}>
      {companion.DIAL_KEYS.map((key: DialKey) => {
        const [low, high] = companion.DIAL_LABELS[key];
        const current = nearestStop(dials[key]);
        return (
          <View key={key} style={styles.row}>
            <Text style={[styles.end, current < 0.5 && styles.endOn]}>{low}</Text>
            <View
              style={styles.track}
              accessibilityRole="adjustable"
              accessibilityLabel={`${low} to ${high}`}
              accessibilityValue={{ min: 0, max: STOPS.length - 1, now: STOPS.indexOf(current as (typeof STOPS)[number]) }}
            >
              {STOPS.map((stop) => (
                <Pressable
                  key={stop}
                  testID={`dial-${key}-${Math.round(stop * 6)}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${key} ${Math.round(stop * 6)} of 6`}
                  hitSlop={6}
                  onPress={() => onChange({ ...dials, [key]: stop })}
                  style={[styles.stop, stop === current && styles.stopOn, stop === 0.5 && stop !== current && styles.stopMid]}
                />
              ))}
            </View>
            <Text style={[styles.end, styles.endRight, current > 0.5 && styles.endOn]}>{high}</Text>
          </View>
        );
      })}
    </View>
  );
}

const STOP = 14;

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  end: { width: 82, fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  endRight: { textAlign: 'right' },
  endOn: { color: colors.coralDeep, fontWeight: '700' },
  track: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  stop: { width: STOP, height: STOP, borderRadius: STOP / 2, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  stopMid: { borderColor: colors.faint },
  stopOn: { backgroundColor: colors.coral, borderColor: colors.coralDeep, transform: [{ scale: 1.25 }] },
});
