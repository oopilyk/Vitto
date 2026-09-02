import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LetterMark } from '@vitto/core';
import { colors, fonts } from '../theme';
import { MARK_APPEARANCE } from './WordPuzzleGrid';

/**
 * The board needs an on-screen keyboard rather than a text input: a letter's state
 * (untried / not in the word / wrong place / right place) has to be visible on the key
 * itself, and the device keyboard cannot render that.
 */
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const;

interface Props {
  /** Best-known mark per letter for the current round. */
  marks: Record<string, LetterMark>;
  onKey: (letter: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  disabled?: boolean;
}

export function WordPuzzleKeyboard({ marks, onKey, onEnter, onBackspace, disabled }: Props) {
  return (
    <View style={styles.keyboard}>
      {ROWS.map((row, rowIndex) => (
        <View key={row} style={styles.row}>
          {rowIndex === 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Submit guess"
              disabled={disabled}
              onPress={onEnter}
              style={({ pressed }) => [styles.key, styles.wideKey, pressed && styles.pressed, disabled && styles.dim]}
            >
              <Text style={styles.actionLabel}>ENTER</Text>
            </Pressable>
          ) : null}
          {row.split('').map((letter) => {
            const appearance = marks[letter] ? MARK_APPEARANCE[marks[letter]!] : null;
            return (
              <Pressable
                key={letter}
                accessibilityRole="button"
                accessibilityLabel={`${letter.toUpperCase()}, ${appearance ? appearance.label : 'not tried yet'}`}
                disabled={disabled}
                onPress={() => onKey(letter)}
                style={({ pressed }) => [
                  styles.key,
                  appearance
                    ? { backgroundColor: appearance.background, borderColor: appearance.foreground }
                    : null,
                  pressed && styles.pressed,
                  disabled && styles.dim,
                ]}
              >
                <Text style={[styles.keyLabel, appearance ? { color: appearance.foreground } : null]}>
                  {letter.toUpperCase()}
                </Text>
                {appearance ? (
                  <Text style={[styles.keyGlyph, { color: appearance.foreground }]}>
                    {appearance.glyph}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {rowIndex === 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete letter"
              disabled={disabled}
              onPress={onBackspace}
              style={({ pressed }) => [styles.key, styles.wideKey, pressed && styles.pressed, disabled && styles.dim]}
            >
              <Text style={styles.actionLabel}>DEL</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { gap: 6 },
  row: { flexDirection: 'row', gap: 5, justifyContent: 'center' },
  key: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideKey: { flexGrow: 1.6 },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.45 },
  keyLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  keyGlyph: { fontSize: 7, lineHeight: 9 },
  actionLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6, color: colors.inkSoft },
});
