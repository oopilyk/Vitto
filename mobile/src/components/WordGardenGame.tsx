import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type BrainTrainingMetadata,
  type WordGardenFind,
  type WordGardenPuzzle,
  WORD_GARDEN_MULTIPLIER_STEPS,
  generateWordGarden,
  isWordGardenBloom,
  judgeWordGardenWord,
  scoreWordGardenFind,
  toWordGardenMetadata,
  wordGardenMultiplier,
  wordGardenNextStage,
  wordGardenPoints,
  wordGardenStage,
  wordGardenVerdictMessage,
} from '@vitto/core';
import { colors, fonts, text } from '../theme';
import { PrimaryButton, TextButton } from './ui';

interface Props {
  onFinish: (metadata: BrainTrainingMetadata, summary: string[]) => void;
  onCancel: () => void;
  /** Injected in tests so the board is repeatable. */
  puzzle?: WordGardenPuzzle;
}

const shuffle = <T,>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

const FLOWER = 220;
const PETAL = 58;
const SEED = 70;
const RING = 78;

/** Petal `index` of five sits on a ring around the seed, the first at twelve o'clock. */
const petalPosition = (index: number) => {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    left: FLOWER / 2 + Math.cos(angle) * RING - PETAL / 2,
    top: FLOWER / 2 + Math.sin(angle) * RING - PETAL / 2,
  };
};

/**
 * A flower of letters: the seed in the middle, five petals round it. Words are
 * built by tapping letters rather than typing, since a device keyboard would let
 * the player type letters that are not in the garden. Consecutive finds grow a
 * run multiplier; any refused entry withers it.
 */
export function WordGardenGame({ onFinish, onCancel, puzzle: given }: Props) {
  const [puzzle] = useState<WordGardenPuzzle>(() => given ?? generateWordGarden());
  const [petals, setPetals] = useState<string[]>(puzzle.petals);
  const [entry, setEntry] = useState('');
  const [found, setFound] = useState<WordGardenFind[]>([]);
  const [streak, setStreak] = useState(0);
  const [notice, setNotice] = useState<{ message: string; tone: 'good' | 'bad' } | null>(null);
  const startedAt = useRef(Date.now());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const points = useMemo(() => wordGardenPoints(found), [found]);
  const stage = wordGardenStage(points, puzzle);
  const next = wordGardenNextStage(points, puzzle);
  const progress = Math.min(1, points / puzzle.fullBloomPoints);
  const multiplier = wordGardenMultiplier(streak);
  const nextStep = WORD_GARDEN_MULTIPLIER_STEPS.find((step) => streak < step);

  const flash = (message: string, tone: 'good' | 'bad') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ message, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 1200);
  };

  const submit = () => {
    if (!entry) return;
    const verdict = judgeWordGardenWord(entry, puzzle, found);
    if (verdict === 'accepted') {
      const word = entry.toLowerCase();
      const scored = scoreWordGardenFind(word, puzzle, streak);
      setFound((current) => [...current, scored]);
      setStreak(streak + 1);
      const bloom = isWordGardenBloom(word, puzzle);
      flash(
        `${bloom ? 'Bloom! ' : ''}+${scored.points}${scored.multiplier > 1 ? ` (×${scored.multiplier})` : ''}`,
        'good',
      );
    } else {
      setStreak(0);
      flash(`${wordGardenVerdictMessage(verdict)}${streak >= 2 ? ' · run withered' : ''}`, 'bad');
    }
    setEntry('');
  };

  const finish = () => {
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const metadata = toWordGardenMetadata(puzzle, found, durationSeconds);
    const foundWords = new Set(found.map((find) => find.word));
    const missedBlooms = puzzle.words.filter((word) => isWordGardenBloom(word, puzzle) && !foundWords.has(word));
    const summary = [
      `${stage.name} · ${points} points · ${found.length} of ${puzzle.words.length} words`,
      ...(missedBlooms.length
        ? [`Bloom${missedBlooms.length > 1 ? 's' : ''} you missed: ${missedBlooms.map((w) => w.toUpperCase()).join(', ')}`]
        : []),
    ];
    onFinish(metadata, summary);
  };

  const addLetter = (letter: string) =>
    setEntry((current) => (current.length < 12 ? current + letter : current));

  return (
    <>
      <View style={styles.stageRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.stageName}>{stage.name}</Text>
          <Text style={styles.stageHint}>
            {next ? `${next.points - points} to ${next.stage.name}` : 'Nothing left to grow'}
          </Text>
        </View>
        <View
          accessible
          accessibilityLabel={`Run multiplier ×${multiplier}`}
          style={[styles.runChip, multiplier > 1 && styles.runChipHot]}
        >
          <Text style={[styles.runValue, multiplier > 1 && styles.runValueHot]}>{`×${multiplier}`}</Text>
          <Text style={[styles.runLabel, multiplier > 1 && styles.runValueHot]}>
            {nextStep ? `${nextStep - streak} more for ×${multiplier + 1}` : 'max run'}
          </Text>
        </View>
        <Text style={styles.points}>
          <Text style={styles.pointsValue}>{points}</Text> pts
        </Text>
      </View>
      <View style={styles.track} accessibilityLabel={`${Math.round(progress * 100)} percent of the way to full bloom`}>
        <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <View style={styles.entryBox}>
        <Text style={styles.entry} numberOfLines={1}>
          {entry
            ? entry.split('').map((letter, index) => (
                <Text
                  // eslint-disable-next-line react/no-array-index-key
                  key={`${letter}-${index}`}
                  style={letter === puzzle.seed ? styles.entrySeed : undefined}
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

      <View style={styles.flowerWrap}>
        <View style={styles.flower}>
          {petals.map((letter, index) => (
            <Pressable
              key={letter}
              accessibilityRole="button"
              accessibilityLabel={letter.toUpperCase()}
              onPress={() => addLetter(letter)}
              style={({ pressed }) => [styles.petal, petalPosition(index), pressed && styles.pressedKey]}
            >
              <Text style={styles.petalLabel}>{letter.toUpperCase()}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${puzzle.seed.toUpperCase()}, seed letter`}
            onPress={() => addLetter(puzzle.seed)}
            style={({ pressed }) => [styles.seed, pressed && styles.pressedKey]}
          >
            <Text style={styles.seedLabel}>{puzzle.seed.toUpperCase()}</Text>
          </Pressable>
        </View>
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
          accessibilityLabel="Shuffle petals"
          onPress={() => setPetals(shuffle(petals))}
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
          <Text style={[styles.controlLabel, styles.controlPrimaryLabel]}>Grow</Text>
        </Pressable>
      </View>

      <View style={styles.foundBox}>
        <Text style={styles.foundHeading}>
          {found.length === 0
            ? 'Words of four letters or more, always using the seed letter. Keep a run going to multiply your points.'
            : `${found.length} ${found.length === 1 ? 'word' : 'words'} grown`}
        </Text>
        {found.length ? (
          <View style={styles.foundList}>
            {[...found].sort((a, b) => (a.word < b.word ? -1 : 1)).map((find) => (
              <Text
                key={find.word}
                style={[styles.foundWord, isWordGardenBloom(find.word, puzzle) && styles.foundBloom]}
              >
                {find.word}
                {find.multiplier > 1 ? <Text style={styles.foundRun}>{` ×${find.multiplier}`}</Text> : null}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <PrimaryButton label={found.length ? "I'm done" : 'Grow a word first'} disabled={!found.length} onPress={finish} />
        <TextButton label="Cancel" onPress={onCancel} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  stageName: { fontSize: 17, fontWeight: '600', color: colors.ink },
  stageHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  runChip: {
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  runChipHot: { backgroundColor: colors.coralWash, borderColor: colors.coral },
  runValue: { fontSize: 15, fontWeight: '700', color: colors.inkSoft },
  runValueHot: { color: colors.coralDeep },
  runLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.faint, marginTop: 1 },
  points: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  pointsValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.hairline, overflow: 'hidden', marginBottom: 14 },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.mintDeep },
  entryBox: { alignItems: 'center', marginBottom: 2, minHeight: 64 },
  entry: { fontFamily: fonts.display, fontSize: 30, color: colors.ink, letterSpacing: 2, minHeight: 40 },
  entrySeed: { color: colors.mintDeep },
  caret: { color: colors.mintDeep, fontWeight: '300' },
  notice: { fontFamily: fonts.mono, fontSize: 11, marginTop: 4, minHeight: 16 },
  noticeGood: { color: colors.mintDeep },
  noticeBad: { color: colors.danger },
  flowerWrap: { alignItems: 'center', marginBottom: 12 },
  flower: { width: FLOWER, height: FLOWER },
  petal: {
    position: 'absolute',
    width: PETAL,
    height: PETAL,
    borderRadius: PETAL / 2,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petalLabel: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  seed: {
    position: 'absolute',
    left: FLOWER / 2 - SEED / 2,
    top: FLOWER / 2 - SEED / 2,
    width: SEED,
    height: SEED,
    borderRadius: SEED / 2,
    borderWidth: 2,
    borderColor: colors.mintDeep,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedLabel: { fontFamily: fonts.display, fontSize: 30, color: colors.mintDeep, fontWeight: '700' },
  pressedKey: { opacity: 0.7, transform: [{ scale: 0.95 }] },
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
  foundBloom: { color: colors.mintDeep, fontWeight: '700' },
  foundRun: { color: colors.coralDeep },
  actions: { marginTop: 24, gap: 16 },
});
