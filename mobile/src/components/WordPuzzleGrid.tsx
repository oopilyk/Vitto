import { StyleSheet, Text, View } from 'react-native';
import type { LetterMark } from '@vitto/core';
import { colors, fonts } from '../theme';

/**
 * One appearance table for both the board and the keyboard, so a letter never reads
 * one way in a tile and another way on its key.
 *
 * Colour is deliberately not the only channel: each mark also carries a distinct
 * glyph and a spoken label, so the board stays readable for a colourblind player and
 * for a screen reader. The hues are the app's own tokens rather than the traffic-light
 * palette every other word game uses.
 */
export const MARK_APPEARANCE: Record<
  LetterMark,
  { background: string; foreground: string; glyph: string; label: string }
> = {
  correct: {
    background: colors.mint,
    foreground: colors.mintDeep,
    glyph: '●',
    label: 'right letter, right place',
  },
  present: {
    background: colors.yellow,
    foreground: colors.yellowDeep,
    glyph: '◆',
    label: 'right letter, wrong place',
  },
  absent: {
    background: colors.slate,
    foreground: colors.slateDeep,
    glyph: '×',
    label: 'not in the word',
  },
};

interface Props {
  length: number;
  maxGuesses: number;
  /** Submitted guesses for this round, in order. */
  guesses: string[];
  /** Marks for each submitted guess, index-aligned with `guesses`. */
  marks: LetterMark[][];
  /** The letters typed but not yet submitted. */
  entry: string;
}

export function WordPuzzleGrid({ length, maxGuesses, guesses, marks, entry }: Props) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: maxGuesses }, (_, row) => {
        const guess = guesses[row];
        const pending = guess === undefined && row === guesses.length ? entry : '';
        return (
          <View key={`row-${row}`} style={styles.row}>
            {Array.from({ length }, (_, column) => {
              const letter = (guess ?? pending)[column] ?? '';
              const mark = guess ? marks[row]?.[column] : undefined;
              const appearance = mark ? MARK_APPEARANCE[mark] : null;
              const spoken = letter
                ? `${letter.toUpperCase()}, ${appearance ? appearance.label : 'not submitted yet'}`
                : 'Empty tile';
              return (
                <View
                  key={`tile-${row}-${column}`}
                  accessible
                  accessibilityLabel={spoken}
                  style={[
                    styles.tile,
                    appearance
                      ? { backgroundColor: appearance.background, borderColor: appearance.foreground }
                      : letter
                        ? styles.tileTyped
                        : null,
                  ]}
                >
                  <Text
                    style={[styles.letter, appearance ? { color: appearance.foreground } : null]}
                  >
                    {letter.toUpperCase()}
                  </Text>
                  {appearance ? (
                    <Text style={[styles.glyph, { color: appearance.foreground }]}>
                      {appearance.glyph}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 7, alignSelf: 'center', width: '100%', maxWidth: 340 },
  row: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: 54,
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTyped: { borderColor: colors.border, backgroundColor: colors.cardSoft },
  letter: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, lineHeight: 26 },
  // The shape marker sits under the letter so feedback survives a colourblind reading.
  glyph: { fontSize: 8, lineHeight: 10, marginTop: 1 },
});
