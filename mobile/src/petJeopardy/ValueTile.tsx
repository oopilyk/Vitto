import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { JeopardyCell } from '@vitto/core';
import { RETRO_BORDER_WIDTH, RETRO_RADIUS, retroPressed, retroShadow } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { cellLabel, valueTone } from './board';

interface ValueTileProps {
  cell: JeopardyCell;
  /** The column's display name — spoken as part of the label, never printed here. */
  categoryLabel: string;
  night: boolean;
  onPress: (id: string) => void;
}

/**
 * One square of the board. Unplayed it is a big, flat value sign whose depth
 * rises with its tier (see `valueTone`); played it is visibly spent — dimmed,
 * unpressable, and printing what it paid out rather than what it was worth, so
 * a glance at the board is a glance at the scorecard.
 */
export function ValueTile({ cell, categoryLabel, night, onPress }: ValueTileProps) {
  const tone = valueTone(cell.value, night);
  const spentMark = cell.correct ? `+${cell.value}` : '—';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cellLabel(categoryLabel, cell)}
      accessibilityState={{ disabled: cell.played }}
      disabled={cell.played}
      onPress={() => onPress(cell.id)}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: tone.fill, borderColor: night ? world.nightInk : world.ink },
        cell.played && styles.spent,
        pressed && !cell.played && retroPressed,
      ]}
    >
      {cell.played ? (
        <View style={styles.spentBody}>
          <Text style={[styles.spentMark, { color: tone.text }]}>{spentMark}</Text>
        </View>
      ) : (
        <Text style={[styles.value, { color: tone.text }]}>{cell.value}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    // Flex rather than a height: the nine squares split whatever the board has
    // left after the header and the score strip, so the grid fits a 667pt phone
    // and a tablet without either one scrolling.
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: RETRO_BORDER_WIDTH,
    borderRadius: RETRO_RADIUS,
    ...retroShadow,
  },
  // No shadow once spent: the tile drops back into the board instead of sitting
  // proud of it, which is most of the "this one is done" read at a glance.
  spent: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  value: { fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5 },
  spentBody: { alignItems: 'center' },
  spentMark: { fontFamily: fonts.mono, fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
});
