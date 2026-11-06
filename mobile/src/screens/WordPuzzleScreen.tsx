import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SheetPage } from '../components/SheetPage';
import {
  type BrainTrainingMetadata,
  type HealthEvent,
  WORD_PUZZLE_ROUNDS,
  type WordPuzzleRoundOutcome,
  type LetterMark,
  errorMessage,
  findWordPuzzleEventForDate,
  generateWordPuzzle,
  wordPuzzleScore,
  wordPuzzleStreak,
  isValidGuess,
  markGuess,
  revealAnswer,
  toDateKey,
  toWordPuzzleMetadata,
} from '@vitto/core';
import { WordPuzzleGrid } from '../components/WordPuzzleGrid';
import { WordPuzzleKeyboard } from '../components/WordPuzzleKeyboard';
import { CloseButton, ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { type WordPuzzleProgress } from '../services/localRepository';
import { colors, fonts, layout, text, themedStyles } from '../theme';

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

/**
 * One five-letter word a day, six guesses. The ladder is a single round, but the
 * progress record keeps its per-round shape so a saved day from before the change
 * still parses.
 */
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
  const [guesses, setGuesses] = useState<string[]>(() => progress?.guesses[0] ?? []);
  const [outcomes, setOutcomes] = useState<WordPuzzleRoundOutcome[]>(() => progress?.outcomes ?? []);
  const [startedAt, setStartedAt] = useState(() => progress?.startedAt ?? new Date().toISOString());
  const [entry, setEntry] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<BrainTrainingMetadata | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const round = puzzle.rounds[0]!;
  // Pulled only for play, and never written to storage or an event.
  const answer = useMemo(() => revealAnswer(todayKey, 0), [todayKey]);
  const marks = useMemo(() => guesses.map((guess) => markGuess(guess, answer)), [guesses, answer]);
  const keyMarks = useMemo(() => {
    const best: Record<string, LetterMark> = {};
    guesses.forEach((guess, row) => {
      guess.split('').forEach((letter, column) => {
        const mark = marks[row]?.[column];
        if (!mark) return;
        const current = best[letter];
        if (!current || MARK_RANK[mark] > MARK_RANK[current]) best[letter] = mark;
      });
    });
    return best;
  }, [guesses, marks]);

  const solved = guesses.length > 0 && guesses[guesses.length - 1] === answer;
  const over = solved || guesses.length >= round.maxGuesses;
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
    if (over || entry.length >= round.length) return;
    setNotice(null);
    setEntry(entry + letter);
  };

  const backspace = () => {
    if (over) return;
    setNotice(null);
    setEntry(entry.slice(0, -1));
  };

  const submit = () => {
    if (over) return;
    if (entry.length !== round.length) {
      setNotice(`Needs ${round.length} letters.`);
      return;
    }
    // A word we don't know costs nothing — rejecting the entry must not burn a guess.
    if (!isValidGuess(entry)) {
      setNotice("That one isn't in the word list.");
      return;
    }

    const nextGuesses = [...guesses, entry];
    setGuesses(nextGuesses);
    setEntry('');
    setNotice(null);

    const gotIt = entry === answer;
    const finished = gotIt || nextGuesses.length >= round.maxGuesses;
    const nextOutcomes = finished
      ? [{ length: round.length, solved: gotIt, guessesUsed: nextGuesses.length }]
      : outcomes;
    if (finished) setOutcomes(nextOutcomes);
    // Saved after every guess, so closing the sheet mid-word resumes rather than restarts.
    onSaveProgress({
      puzzleDate: todayKey,
      startedAt,
      roundIndex: finished ? 1 : 0,
      guesses: [nextGuesses],
      outcomes: nextOutcomes,
    });
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

  return (
    <SheetPage onBackPress={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View>
            <Kicker>Word puzzle</Kicker>
            <Text style={styles.title}>Today's word</Text>
          </View>
          <CloseButton onPress={onClose} />
        </View>

        {stage === 'play' ? (
          <View style={styles.play}>
            <Text style={styles.roundHint}>
              {`${round.length} letters · ${round.maxGuesses - guesses.length} of ${round.maxGuesses} guesses left`}
            </Text>

            <View style={styles.board}>
              <WordPuzzleGrid
                length={round.length}
                maxGuesses={round.maxGuesses}
                guesses={guesses}
                marks={marks}
                entry={entry}
              />
            </View>

            <View style={styles.footer}>
              {over ? (
                <>
                  <Text style={styles.verdict}>
                    {solved
                      ? `Got it in ${guesses.length}.`
                      : `The word was ${answer.toUpperCase()}.`}
                  </Text>
                  <PrimaryButton label="See your score" onPress={() => setStage('summary')} />
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
                  One five-letter word, once a day. You get six guesses, and a word we don't
                  recognise costs you nothing. No clock — take your time.
                </Text>
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Today's word</Text>
                  <Text style={styles.cardValue}>5 letters · 6 guesses</Text>
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
                <ScoreCard score={wordPuzzleScore(outcomes)} outcome={outcomes[0]} answer={answer} maxGuesses={round.maxGuesses} />
                <Text style={styles.note}>
                  {outcomes[0]?.solved
                    ? 'Logging it feeds your pet and keeps the streak alive.'
                    : 'Logging it still counts as today\'s puzzle, so the streak stays alive.'}
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
                  outcome={finalMetadata?.roundOutcomes?.[0]}
                  answer={answer}
                  maxGuesses={round.maxGuesses}
                />
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Streak</Text>
                  <Text style={styles.cardValue}>
                    {streak.currentStreak} {streak.currentStreak === 1 ? 'day' : 'days'}
                  </Text>
                  <Text style={styles.cardHint}>Longest run {streak.longestStreak}</Text>
                </View>
                <Text style={styles.note}>Today's word is played. A new one lands tomorrow.</Text>
                <View style={styles.actions}>
                  <PrimaryButton label="Back to your pet" onPress={onClose} />
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </SheetPage>
  );
}

/**
 * How today's word went. Solved: in how many of the guesses, drawn as a row
 * of dots, and the points. Not solved: the word itself, since not knowing it
 * is the worst part of missing one.
 */
function ScoreCard({
  score,
  outcome,
  answer,
  maxGuesses,
}: {
  score: number;
  outcome?: WordPuzzleRoundOutcome;
  answer: string;
  maxGuesses: number;
}) {
  const solved = outcome?.solved ?? false;
  const used = outcome?.guessesUsed ?? 0;
  return (
    <View style={[layout.card, styles.scoreCard]} testID="word-score">
      <View style={styles.scoreHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.scoreLabel}>{solved ? `Solved in ${used} of ${maxGuesses}` : 'Not this time'}</Text>
          <Text style={styles.scoreMeta}>
            {!solved ? 'The word was' : used <= 2 ? 'Brilliant.' : used <= 4 ? 'Nice work.' : 'Got there in the end.'}
          </Text>
        </View>
        {score > 0 ? (
          <View style={styles.points}>
            <Text style={styles.pointsValue}>+{score}</Text>
            <Text style={styles.pointsUnit}>points</Text>
          </View>
        ) : null}
      </View>
      {solved ? (
        <View style={styles.pips} accessibilityLabel={`${used} of ${maxGuesses} guesses used`}>
          {Array.from({ length: maxGuesses }, (_, index) => (
            <View
              key={index}
              style={[styles.pip, index < used && styles.pipUsed, index === used - 1 && styles.pipWin]}
            />
          ))}
        </View>
      ) : (
        <View style={styles.answer} accessibilityLabel={`The word was ${answer}`}>
          {answer.toUpperCase().split('').map((letter, index) => (
            <View key={index} style={styles.answerTile}>
              <Text style={styles.answerLetter}>{letter}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  title: { ...text.title, marginTop: 8 },
  body: { padding: 22, paddingBottom: 60 },
  // The keyboard is pinned, so the play stage lays out with flex rather than scrolling.
  play: { flex: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18 },
  roundHint: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, textAlign: 'center' },
  board: { flex: 1, justifyContent: 'center', paddingVertical: 12 },
  footer: { gap: 12 },
  notice: { fontFamily: fonts.ui, fontSize: 12, color: colors.danger, textAlign: 'center' },
  noticeIdle: { color: colors.faint },
  verdict: { ...text.body, textAlign: 'center' },
  intro: { ...text.body, marginBottom: 18 },
  note: { ...text.small, marginTop: 16, lineHeight: 20 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    marginTop: 14,
  },
  cardLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, letterSpacing: 0 },
  cardValue: { fontFamily: fonts.ui, fontSize: 22, color: colors.ink, marginTop: 6 },
  cardHint: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 5 },
  actions: { marginTop: 24, gap: 16 },
  scoreCard: { gap: 16 },
  scoreHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  scoreLabel: { ...text.heading, fontSize: 20, fontWeight: '700' },
  scoreMeta: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, marginTop: 4 },
  points: { alignItems: 'flex-end' },
  pointsValue: { fontFamily: fonts.ui, fontSize: 22, fontWeight: '700', color: colors.coralDeep, fontVariant: ['tabular-nums'] },
  pointsUnit: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.tile },
  pipUsed: { backgroundColor: colors.coralWash },
  pipWin: { backgroundColor: colors.mintDeep },
  answer: { flexDirection: 'row', gap: 6 },
  answerTile: {
    width: 44,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
  },
  answerLetter: { fontFamily: fonts.serif, fontSize: 24, fontWeight: '700', color: colors.onCoral },
}));
