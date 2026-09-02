import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type BrainTrainingMetadata,
  type HealthEvent,
  WORD_PUZZLE_LENGTHS,
  WORD_PUZZLE_ROUNDS,
  type WordPuzzleRoundOutcome,
  type LetterMark,
  errorMessage,
  findWordPuzzleEventForDate,
  generateWordPuzzle,
  wordPuzzleScore,
  wordPuzzleSolvedCount,
  wordPuzzleStreak,
  isValidGuess,
  markGuess,
  revealAnswer,
  toDateKey,
  toWordPuzzleMetadata,
} from '@vitto/core';
import { WordPuzzleGrid } from '../components/WordPuzzleGrid';
import { WordPuzzleKeyboard } from '../components/WordPuzzleKeyboard';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { type WordPuzzleProgress } from '../services/localRepository';
import { colors, fonts, text } from '../theme';

interface Props {
  events: HealthEvent[];
  progress: WordPuzzleProgress | null;
  onSaveProgress: (progress: WordPuzzleProgress) => void;
  onClearProgress: () => void;
  onFinish: (metadata: BrainTrainingMetadata) => Promise<void>;
  onClose: () => void;
}

type Stage = 'intro' | 'play' | 'summary' | 'done';

/** Later marks never downgrade an earlier one: once correct, a key stays correct. */
const MARK_RANK: Record<LetterMark, number> = { absent: 0, present: 1, correct: 2 };

export function WordPuzzleScreen({
  events,
  progress,
  onSaveProgress,
  onClearProgress,
  onFinish,
  onClose,
}: Props) {
  // The puzzle date is fixed at mount. A session carried across midnight keeps playing
  // -- and scoring -- the day it opened, which is what the streak is keyed on.
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const puzzle = useMemo(() => generateWordPuzzle(todayKey), [todayKey]);
  const todayEvent = useMemo(
    () => findWordPuzzleEventForDate(events, todayKey),
    [events, todayKey],
  );
  const streak = useMemo(() => wordPuzzleStreak(events), [events]);

  // Read once, at mount. One attempt a day: an event for today means the board is
  // closed, and nothing that happens later in this session may reopen it.
  const [stage, setStage] = useState<Stage>(() => {
    if (todayEvent) return 'done';
    if (!progress) return 'intro';
    return progress.outcomes.length >= WORD_PUZZLE_ROUNDS ? 'summary' : 'play';
  });
  const [roundIndex, setRoundIndex] = useState(() =>
    Math.min(Math.max(progress?.roundIndex ?? 0, 0), WORD_PUZZLE_ROUNDS - 1),
  );
  const [guesses, setGuesses] = useState<string[][]>(() => progress?.guesses ?? []);
  const [outcomes, setOutcomes] = useState<WordPuzzleRoundOutcome[]>(() => progress?.outcomes ?? []);
  const [startedAt, setStartedAt] = useState(() => progress?.startedAt ?? new Date().toISOString());
  const [entry, setEntry] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<BrainTrainingMetadata | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const round = puzzle.rounds[roundIndex]!;
  // Pulled only for the round in play, and never written to storage or an event.
  const answer = useMemo(() => revealAnswer(todayKey, roundIndex), [todayKey, roundIndex]);
  const roundGuesses = useMemo(() => guesses[roundIndex] ?? [], [guesses, roundIndex]);
  const roundMarks = useMemo(
    () => roundGuesses.map((guess) => markGuess(guess, answer)),
    [roundGuesses, answer],
  );
  const keyMarks = useMemo(() => {
    const best: Record<string, LetterMark> = {};
    roundGuesses.forEach((guess, row) => {
      guess.split('').forEach((letter, column) => {
        const mark = roundMarks[row]?.[column];
        if (!mark) return;
        const current = best[letter];
        if (!current || MARK_RANK[mark] > MARK_RANK[current]) best[letter] = mark;
      });
    });
    return best;
  }, [roundGuesses, roundMarks]);

  const solved = roundGuesses.length > 0 && roundGuesses[roundGuesses.length - 1] === answer;
  const roundOver = solved || roundGuesses.length >= round.maxGuesses;
  const finalMetadata = todayEvent?.metadata ?? saved;

  const start = () => {
    const now = new Date().toISOString();
    setStartedAt(now);
    setStage('play');
    onSaveProgress({
      puzzleDate: todayKey,
      startedAt: now,
      roundIndex: 0,
      guesses: [],
      outcomes: [],
    });
  };

  const typeLetter = (letter: string) => {
    if (roundOver || entry.length >= round.length) return;
    setNotice(null);
    setEntry(entry + letter);
  };

  const backspace = () => {
    if (roundOver) return;
    setNotice(null);
    setEntry(entry.slice(0, -1));
  };

  const submit = () => {
    if (roundOver) return;
    if (entry.length !== round.length) {
      setNotice(`Needs ${round.length} letters.`);
      return;
    }
    // A word we don't know costs nothing — rejecting the entry must not burn a guess.
    if (!isValidGuess(entry)) {
      setNotice("That one isn't in the word list.");
      return;
    }

    const nextRoundGuesses = [...roundGuesses, entry];
    const nextGuesses = [...guesses];
    nextGuesses[roundIndex] = nextRoundGuesses;
    setGuesses(nextGuesses);
    setEntry('');
    setNotice(null);

    const gotIt = entry === answer;
    if (!gotIt && nextRoundGuesses.length < round.maxGuesses) return;

    const nextOutcomes = [
      ...outcomes,
      { length: round.length, solved: gotIt, guessesUsed: nextRoundGuesses.length },
    ];
    setOutcomes(nextOutcomes);
    // Saved on every round boundary: five rounds is long enough that being able to
    // pick the day back up is what gets people to the end of it.
    onSaveProgress({
      puzzleDate: todayKey,
      startedAt,
      roundIndex: roundIndex + 1,
      guesses: nextGuesses,
      outcomes: nextOutcomes,
    });
  };

  const nextRound = () => {
    setEntry('');
    setNotice(null);
    if (roundIndex + 1 >= WORD_PUZZLE_ROUNDS) {
      setStage('summary');
      return;
    }
    setRoundIndex(roundIndex + 1);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - Date.parse(startedAt)) / 1000),
      );
      const metadata = toWordPuzzleMetadata(puzzle, outcomes, durationSeconds);
      await onFinish(metadata);
      setSaved(metadata);
      onClearProgress();
      setStage('done');
    } catch (cause) {
      setError(errorMessage(cause, "Could not save today's puzzle."));
    } finally {
      setSaving(false);
    }
  };

  const title =
    stage === 'play' ? `Round ${roundIndex + 1} of ${WORD_PUZZLE_ROUNDS}` : "Today's word puzzle";

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View>
            <Kicker>Word puzzle</Kicker>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeMark}>×</Text>
          </Pressable>
        </View>

        {stage === 'play' ? (
          <View style={styles.play}>
            <View style={styles.playHead}>
              <OutcomeStrip outcomes={outcomes} current={roundIndex} />
              <Text style={styles.roundHint}>
                {round.length} letters · {round.maxGuesses - roundGuesses.length} of{' '}
                {round.maxGuesses} guesses left
              </Text>
            </View>

            <View style={styles.board}>
              <WordPuzzleGrid
                length={round.length}
                maxGuesses={round.maxGuesses}
                guesses={roundGuesses}
                marks={roundMarks}
                entry={entry}
              />
            </View>

            <View style={styles.footer}>
              {roundOver ? (
                <>
                  <Text style={styles.verdict}>
                    {solved
                      ? `Got it in ${roundGuesses.length}.`
                      : `The word was ${answer.toUpperCase()}.`}
                  </Text>
                  <PrimaryButton
                    label={roundIndex + 1 >= WORD_PUZZLE_ROUNDS ? 'See your day' : 'Next round'}
                    onPress={nextRound}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.notice, !notice && styles.noticeIdle]}>
                    {notice ?? 'Tap ENTER when the row is full.'}
                  </Text>
                  <WordPuzzleKeyboard
                    marks={keyMarks}
                    onKey={typeLetter}
                    onEnter={submit}
                    onBackspace={backspace}
                  />
                </>
              )}
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {stage === 'intro' ? (
              <>
                <Text style={styles.intro}>
                  Five words, once a day. The guesses you get are the letters in the word, and a
                  word we don't recognise costs you nothing. No clock — take your time.
                </Text>
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Today's ladder</Text>
                  <Text style={styles.cardValue}>{WORD_PUZZLE_LENGTHS.join(' · ')} letters</Text>
                  <Text style={styles.cardHint}>
                    {streak.currentStreak > 0
                      ? `${streak.currentStreak}-day streak on the line`
                      : 'Start a streak today'}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <PrimaryButton label="Start today's puzzle" onPress={start} />
                  <TextButton label="Not now" onPress={onClose} />
                </View>
              </>
            ) : null}

            {stage === 'summary' ? (
              <>
                <ScoreCard
                  score={wordPuzzleScore(outcomes)}
                  solvedCount={wordPuzzleSolvedCount(outcomes)}
                />
                <OutcomeStrip outcomes={outcomes} />
                <Text style={styles.note}>
                  That's the day. Logging it feeds your pet and keeps the streak alive.
                </Text>
                <ErrorText>{error}</ErrorText>
                <View style={styles.actions}>
                  <PrimaryButton
                    label={saving ? 'Saving...' : 'Add to care log'}
                    busy={saving}
                    onPress={() => void save()}
                  />
                </View>
              </>
            ) : null}

            {stage === 'done' ? (
              <>
                <ScoreCard
                  score={finalMetadata?.score ?? 0}
                  solvedCount={finalMetadata?.correct ?? 0}
                />
                <OutcomeStrip outcomes={finalMetadata?.roundOutcomes ?? []} />
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Streak</Text>
                  <Text style={styles.cardValue}>
                    {streak.currentStreak} {streak.currentStreak === 1 ? 'day' : 'days'}
                  </Text>
                  <Text style={styles.cardHint}>Longest run {streak.longestStreak}</Text>
                </View>
                <Text style={styles.note}>
                  Today's puzzle is played. A new set of five lands tomorrow.
                </Text>
                <View style={styles.actions}>
                  <PrimaryButton label="Back to your pet" onPress={onClose} />
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function ScoreCard({ score, solvedCount }: { score: number; solvedCount: number }) {
  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreBadge}>
        <Text style={styles.scoreNumber}>{score}</Text>
        <Text style={styles.scoreCaption}>WORD PUZZLE</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.scoreLabel}>
          {solvedCount} of {WORD_PUZZLE_ROUNDS} solved
        </Text>
        <Text style={styles.scoreMeta}>
          {solvedCount === WORD_PUZZLE_ROUNDS
            ? 'A clean sweep.'
            : solvedCount >= 4
              ? 'Strong day.'
              : 'Every day counts.'}
        </Text>
      </View>
    </View>
  );
}

/** The five rounds at a glance: solved, missed, in play, or still ahead. */
function OutcomeStrip({
  outcomes,
  current,
}: {
  outcomes: WordPuzzleRoundOutcome[];
  current?: number;
}) {
  return (
    <View style={styles.strip}>
      {WORD_PUZZLE_LENGTHS.map((length, index) => {
        const outcome = outcomes[index];
        const inPlay = current === index && !outcome;
        const state = outcome
          ? outcome.solved
            ? `solved in ${outcome.guessesUsed}`
            : 'not solved'
          : inPlay
            ? 'in play'
            : 'not played yet';
        return (
          <View
            key={`round-${index}`}
            accessible
            accessibilityLabel={`Round ${index + 1}, ${length} letters, ${state}`}
            style={[
              styles.pip,
              outcome?.solved && styles.pipSolved,
              outcome && !outcome.solved && styles.pipMissed,
              inPlay && styles.pipCurrent,
            ]}
          >
            <Text
              style={[
                styles.pipLabel,
                outcome?.solved && { color: colors.mintDeep },
                outcome && !outcome.solved && { color: colors.slateDeep },
              ]}
            >
              {length}
            </Text>
            <Text style={styles.pipMark}>
              {outcome ? (outcome.solved ? '●' : '×') : inPlay ? '◆' : '·'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  title: { ...text.title, marginTop: 8 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMark: { fontSize: 24, color: colors.muted, lineHeight: 28 },
  body: { padding: 22, paddingBottom: 60 },
  // The keyboard is pinned, so the play stage lays out with flex rather than scrolling.
  play: { flex: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18 },
  playHead: { gap: 10 },
  roundHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, textAlign: 'center' },
  board: { flex: 1, justifyContent: 'center', paddingVertical: 12 },
  footer: { gap: 12 },
  notice: { fontFamily: fonts.mono, fontSize: 11, color: colors.danger, textAlign: 'center' },
  noticeIdle: { color: colors.faint },
  verdict: { ...text.body, textAlign: 'center' },
  intro: { ...text.body, marginBottom: 18 },
  note: { ...text.small, marginTop: 16, lineHeight: 18 },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    marginTop: 14,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, letterSpacing: 0.6 },
  cardValue: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginTop: 6 },
  cardHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 5 },
  actions: { marginTop: 24, gap: 16 },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.3)',
    backgroundColor: colors.sageSoft,
  },
  scoreBadge: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: { fontFamily: fonts.display, fontSize: 28, color: '#fff' },
  scoreCaption: { fontFamily: fonts.mono, fontSize: 7, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6 },
  scoreLabel: { fontSize: 17, fontWeight: '600', color: colors.ink },
  scoreMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 6 },
  strip: { flexDirection: 'row', gap: 7, marginTop: 14, justifyContent: 'center' },
  pip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  pipSolved: { backgroundColor: colors.mint, borderColor: colors.mintDeep },
  pipMissed: { backgroundColor: colors.slate, borderColor: colors.slateDeep },
  pipCurrent: { borderColor: colors.yellowDeep, backgroundColor: colors.yellow },
  pipLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft },
  pipMark: { fontSize: 8, color: colors.muted, marginTop: 2 },
});
