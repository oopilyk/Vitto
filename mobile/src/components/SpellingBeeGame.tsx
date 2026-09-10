import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type BrainTrainingMetadata,
  type SpellingBeePuzzle,
  generateSpellingBee,
  isSpellingBeePangram,
  judgeSpellingBeeWord,
  spellingBeeNextRank,
  spellingBeePoints,
  spellingBeeRank,
  spellingBeeVerdictMessage,
  spellingBeeWordPoints,
  toSpellingBeeMetadata,
} from '@vitto/core';
import { colors, fonts, text } from '../theme';
import { PrimaryButton, TextButton } from './ui';

interface Props {
  onFinish: (metadata: BrainTrainingMetadata, summary: string[]) => void;
  onCancel: () => void;
  /** Injected in tests so the board is repeatable. */
  puzzle?: SpellingBeePuzzle;
}

const shuffle = <T,>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

/**
 * Six letters in a honeycomb, the centre one lit. Words are built by tapping
 * letters rather than typing: the board is the keyboard, and a device keyboard
 * would let the player type letters that are not in play.
 */
export function SpellingBeeGame({ onFinish, onCancel, puzzle: given }: Props) {
  const [puzzle] = useState<SpellingBeePuzzle>(() => given ?? generateSpellingBee());
  const [outer, setOuter] = useState<string[]>(puzzle.outer);
  const [entry, setEntry] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ message: string; tone: 'good' | 'bad' } | null>(null);
  const startedAt = useRef(Date.now());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const points = useMemo(() => spellingBeePoints(found, puzzle), [found, puzzle]);
  const rank = spellingBeeRank(points, puzzle);
  const next = spellingBeeNextRank(points, puzzle);
  const progress = Math.min(1, points / puzzle.geniusPoints);

  const flash = (message: string, tone: 'good' | 'bad') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ message, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 1200);
  };

  const submit = () => {
    if (!entry) return;
    const verdict = judgeSpellingBeeWord(entry, puzzle, found);
    if (verdict === 'accepted') {
      const word = entry.toLowerCase();
      const earned = spellingBeeWordPoints(word, puzzle);
      setFound((current) => [...current, word]);
      flash(isSpellingBeePangram(word, puzzle) ? `Pangram! +${earned}` : `+${earned}`, 'good');
    } else {
      flash(spellingBeeVerdictMessage(verdict), 'bad');
    }
    setEntry('');
  };

  const finish = () => {
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const metadata = toSpellingBeeMetadata(puzzle, found, durationSeconds);
    const missedPangrams = puzzle.words.filter(
      (word) => isSpellingBeePangram(word, puzzle) && !found.includes(word),
    );
    const summary = [
      `${rank.name} · ${points} of ${puzzle.maxPoints} points · ${found.length} of ${puzzle.words.length} words`,
      ...(missedPangrams.length
        ? [`Pangram${missedPangrams.length > 1 ? 's' : ''} you missed: ${missedPangrams.map((w) => w.toUpperCase()).join(', ')}`]
        : []),
    ];
    onFinish(metadata, summary);
  };

  const letterKey = (letter: string, isCenter: boolean) => (
    <Pressable
      key={letter}
      accessibilityRole="button"
      accessibilityLabel={`${letter.toUpperCase()}${isCenter ? ', centre letter' : ''}`}
      onPress={() => setEntry((current) => (current.length < 12 ? current + letter : current))}
      style={({ pressed }) => [styles.hex, isCenter && styles.hexCenter, pressed && styles.hexPressed]}
    >
      <Text style={[styles.hexLabel, isCenter && styles.hexLabelCenter]}>{letter.toUpperCase()}</Text>
    </Pressable>
  );

  return (
    <>
      <View style={styles.rankRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rankName}>{rank.name}</Text>
          <Text style={styles.rankHint}>
            {next ? `${next.points - points} to ${next.rank.name}` : 'You found every point on the board'}
          </Text>
        </View>
        <Text style={styles.points}>
          <Text style={styles.pointsValue}>{points}</Text> pts
        </Text>
      </View>
      <View style={styles.track} accessibilityLabel={`${Math.round(progress * 100)} percent of the way to genius`}>
        <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <View style={styles.entryBox}>
        <Text style={styles.entry} numberOfLines={1}>
          {entry
            ? entry.split('').map((letter, index) => (
                <Text
                  // eslint-disable-next-line react/no-array-index-key
                  key={`${letter}-${index}`}
                  style={letter === puzzle.center ? styles.entryCenter : undefined}
                >
                  {letter.toUpperCase()}
                </Text>
              ))
            : ' '}
          <Text style={styles.caret}>|</Text>
        </Text>
        <Text style={[styles.notice, notice?.tone === 'good' ? styles.noticeGood : styles.noticeBad]}>
          {notice?.message ?? ' '}
        </Text>
      </View>

      <View style={styles.hive}>
        <View style={styles.hiveRow}>{outer.slice(0, 2).map((letter) => letterKey(letter, false))}</View>
        <View style={styles.hiveRow}>
          {letterKey(outer[2]!, false)}
          {letterKey(puzzle.center, true)}
          {letterKey(outer[3]!, false)}
        </View>
        <View style={styles.hiveRow}>{letterKey(outer[4]!, false)}</View>
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete letter"
          onPress={() => setEntry((current) => current.slice(0, -1))}
          style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
        >
          <Text style={styles.controlLabel}>Delete</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Shuffle letters"
          onPress={() => setOuter(shuffle(outer))}
          style={({ pressed }) => [styles.control, styles.controlRound, pressed && styles.controlPressed]}
        >
          <Text style={styles.controlLabel}>⟳</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit word"
          onPress={submit}
          style={({ pressed }) => [styles.control, styles.controlPrimary, pressed && styles.controlPressed]}
        >
          <Text style={[styles.controlLabel, styles.controlPrimaryLabel]}>Enter</Text>
        </Pressable>
      </View>

      <View style={styles.foundBox}>
        <Text style={styles.foundHeading}>
          {found.length === 0
            ? 'Words of four letters or more, always using the centre letter.'
            : `${found.length} ${found.length === 1 ? 'word' : 'words'} found`}
        </Text>
        {found.length ? (
          <View style={styles.foundList}>
            {[...found].sort().map((word) => (
              <Text
                key={word}
                style={[styles.foundWord, isSpellingBeePangram(word, puzzle) && styles.foundPangram]}
              >
                {word}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <PrimaryButton label={found.length ? "I'm done" : 'Find a word first'} disabled={!found.length} onPress={finish} />
        <TextButton label="Cancel" onPress={onCancel} />
      </View>
    </>
  );
}

const HEX = 62;

const styles = StyleSheet.create({
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  rankName: { fontSize: 17, fontWeight: '600', color: colors.ink },
  rankHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  points: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  pointsValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.hairline, overflow: 'hidden', marginBottom: 18 },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.yellowDeep },
  entryBox: { alignItems: 'center', marginBottom: 6, minHeight: 64 },
  entry: { fontFamily: fonts.display, fontSize: 30, color: colors.ink, letterSpacing: 2, minHeight: 40 },
  entryCenter: { color: colors.yellowDeep },
  caret: { color: colors.yellowDeep, fontWeight: '300' },
  notice: { fontFamily: fonts.mono, fontSize: 11, marginTop: 4, minHeight: 16 },
  noticeGood: { color: colors.mintDeep },
  noticeBad: { color: colors.danger },
  hive: { alignItems: 'center', gap: -6, marginBottom: 16 },
  hiveRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 4 },
  hex: {
    width: HEX,
    height: HEX,
    borderRadius: HEX / 2,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexCenter: { backgroundColor: colors.yellow, borderColor: colors.yellowDeep },
  hexPressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  hexLabel: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  hexLabelCenter: { color: colors.yellowDeep, fontWeight: '700' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  control: {
    paddingHorizontal: 18,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlRound: { width: 42, paddingHorizontal: 0 },
  controlPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  controlPressed: { opacity: 0.7 },
  controlLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  controlPrimaryLabel: { color: '#fff' },
  foundBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  foundHeading: { ...text.body, fontSize: 13, color: colors.muted },
  foundList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  foundWord: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink, textTransform: 'uppercase' },
  foundPangram: { color: colors.yellowDeep, fontWeight: '700' },
  actions: { marginTop: 24, gap: 16 },
});
