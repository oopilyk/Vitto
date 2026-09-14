import { StyleSheet, Text, View } from 'react-native';
import { JEOPARDY_PICKS_PER_ROUND, JEOPARDY_VALUES, type JeopardyGame } from '@vitto/core';
import { retro } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { ValueTile } from './ValueTile';

interface JeopardyBoardProps {
  game: JeopardyGame;
  night: boolean;
  onPick: (cellId: string) => void;
}

/**
 * The board: one column per category, one row per value tier.
 *
 * Laid out as flex columns rather than a scrolling grid on purpose — a board you
 * have to scroll sideways is a board you cannot read, and the whole appeal of
 * the format is seeing every square at once. Three columns of `flex: 1` divide
 * whatever width the phone has, and the rows divide whatever height is left, so
 * the same nine tiles fit a 360pt phone and an iPad with no breakpoints.
 */
export function JeopardyBoard({ game, night, onPick }: JeopardyBoardProps) {
  const labelOf = (categoryId: string): string =>
    game.categories.find((category) => category.id === categoryId)?.label ?? categoryId;

  const picked = game.cells.filter((cell) => cell.played).length;

  return (
    <View style={styles.wrap}>
      <View style={[styles.scoreStrip, retro.panelQuiet, night && retro.panelQuietNight]}>
        <Text style={[retro.kicker, night && retro.kickerNight]}>This session</Text>
        <Text style={[styles.score, night && styles.scoreNight]}>{`${game.boardPoints} XP`}</Text>
        <Text style={[retro.caption, night && retro.captionNight]}>
          {`${picked} / ${JEOPARDY_PICKS_PER_ROUND} picks used`}
        </Text>
      </View>

      <View style={styles.grid}>
        {game.categories.map((category) => (
          <View key={category.id} style={styles.column}>
            <View style={[styles.categoryHead, retro.panel, night && retro.panelNight]}>
              {/* The column head names the category once; every tile beneath it
                  repeats the name in its accessibility label, since a screen
                  reader lands on a tile with no sense of which column it is in. */}
              <Text
                style={[styles.categoryLabel, night && styles.categoryLabelNight]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {category.label}
              </Text>
            </View>

            {JEOPARDY_VALUES.map((value) => {
              const cell = game.cells.find(
                (item) => item.categoryId === category.id && item.value === value,
              );
              if (!cell) return null;
              return (
                <ValueTile
                  key={cell.id}
                  cell={cell}
                  categoryLabel={labelOf(cell.categoryId)}
                  night={night}
                  onPress={onPick}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  scoreStrip: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, gap: 2 },
  score: { fontFamily: fonts.display, fontSize: 20, color: world.ink, letterSpacing: -0.4 },
  scoreNight: { color: world.nightText },
  grid: { flex: 1, flexDirection: 'row', gap: 8, marginTop: 10 },
  column: { flex: 1, gap: 8 },
  categoryHead: { paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  categoryLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
    textTransform: 'uppercase',
    color: world.ink,
  },
  categoryLabelNight: { color: world.nightText },
});
