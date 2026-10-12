import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

/**
 * How much to scale text down so it fits, from real measurements:
 *
 * - `avail`: the width the text has.
 * - `natural`: the whole text's width on one line at full size.
 * - `longest`: its widest word at full size (only matters over several lines,
 *   where a word wider than the line would be broken in two).
 *
 * One line: whatever brings the whole text inside the width. Several: enough
 * that the text fills its lines with some room to spare for how words wrap,
 * and the widest word still fits on a line of its own. Never below `minScale`;
 * `fits` says whether the text fits even then. Nothing measured yet means full
 * size, never a guess downwards.
 */
export const fitScale = ({
  avail,
  natural,
  longest = 0,
  lines = 1,
  minScale = 0.7,
}: {
  avail: number;
  natural: number;
  longest?: number;
  lines?: number;
  minScale?: number;
}): { scale: number; fits: boolean } => {
  if (!(avail > 0) || !(natural > 0)) return { scale: 1, fits: true };
  // A hair under the measured width: a line that fits exactly can still wrap.
  const room = avail * 0.98;
  const wanted =
    lines <= 1
      ? room / natural
      : Math.min((room * lines * 0.88) / natural, longest > 0 ? room / longest : Infinity);
  if (wanted >= 1) return { scale: 1, fits: true };
  return wanted >= minScale ? { scale: wanted, fits: true } : { scale: minScale, fits: false };
};

type Props = Omit<TextProps, 'children' | 'numberOfLines' | 'adjustsFontSizeToFit' | 'minimumFontScale'> & {
  children: string;
  /** The lines the text should fit on. */
  lines?: number;
  /** The smallest it may go, as a share of its own size. */
  minScale?: number;
  /** Where the text sits in its parent (it measures this box's width). Stretches across by default. */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Text that shrinks to fit its lines, sized here in JavaScript rather than by
 * the platform.
 *
 * iOS's own `adjustsFontSizeToFit` cannot be trusted under the new
 * architecture: it shrank labels with plenty of room to a fraction of their
 * size, at random ("Not yet" and "2 days" in 6pt in onboarding), ignoring
 * `minimumFontScale`. So nothing in the app uses it (see noAutoShrink.test);
 * this measures the text itself, in its real font, with a hidden copy on one
 * unbounded line, and picks the size.
 *
 * It never goes below `minScale`, and starts at full size until measured. A
 * text that still does not fit at the floor wraps onto another line rather
 * than ending in "…". Web does not report text layout, so there it stays at
 * full size, as react-native-web always did.
 */
export function FitText({ children, style, lines = 1, minScale = 0.7, containerStyle, ...rest }: Props) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const base = flat.fontSize ?? 14;
  const [avail, setAvail] = useState(0);
  const [natural, setNatural] = useState(0);
  const [longest, setLongest] = useState(0);
  const longestWord = useMemo(
    () => children.split(/\s+/).reduce((widest, word) => (word.length > widest.length ? word : widest), ''),
    [children],
  );

  // A one-word text is its own widest word.
  // The text's own side padding is not room for letters.
  const pad = (side: 'Left' | 'Right') =>
    Number(flat[`padding${side}`] ?? flat.paddingHorizontal ?? flat.padding ?? 0) || 0;
  const room = Math.max(0, avail - pad('Left') - pad('Right'));
  const { scale, fits } = fitScale({ avail: room, natural, longest: longestWord === children ? natural : longest, lines, minScale });
  const sized: TextStyle | null =
    scale < 1
      ? { fontSize: base * scale, ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}) }
      : null;
  const widest = (event: { nativeEvent: { lines: { width: number }[] } }) =>
    event.nativeEvent.lines.reduce((most, line) => Math.max(most, line.width), 0);

  return (
    <View
      style={[styles.container, containerStyle]}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setAvail((current) => (Math.abs(current - width) < 0.5 ? current : width));
      }}
    >
      <Text {...rest} style={[style, sized]} numberOfLines={fits ? lines : undefined}>
        {children}
      </Text>
      {/* The ruler: the same text at full size on one line nothing can wrap. */}
      <View style={styles.ruler} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={style} onTextLayout={(event) => setNatural(widest(event))}>
          {children}
        </Text>
        {lines > 1 && longestWord !== children ? (
          <Text style={style} onTextLayout={(event) => setLongest(widest(event))}>
            {longestWord}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  ruler: { position: 'absolute', top: 0, left: 0, width: 4000, opacity: 0 },
});
