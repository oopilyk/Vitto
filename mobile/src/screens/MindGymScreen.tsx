import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SheetPage } from '../components/SheetPage';
import { type BrainTrainingMetadata, type HealthEvent, type PetState, type ReadingPassage, errorMessage, mindRecapForDay, mindScore, mindScoreLabel, pickReadingPassage } from '@vitto/core';
import { CountryGuessGame } from '../components/CountryGuessGame';
import { WordGardenGame } from '../components/WordGardenGame';
import { CloseButton, ErrorText, PrimaryButton, TextButton } from '../components/ui';
import { LogProgress, logHaptic } from '../components/logKit';
import { MathRunGame } from '../mathRun/MathRunGame';
import { MindHub } from '../mind/MindHub';
import type { MindRouteHandlers } from '../mind/hub';
import type { MindStage } from '../mind/types';
import { colors, fonts, text, themedStyles } from '../theme';

/**
 * The Mind section: a game room to choose from, and the sheet the four
 * in-house games are actually played in.
 *
 * The menu that used to live here is now {@link MindHub} — a scenic, browsable
 * page over the study, driven entirely by the game registry. This file is the
 * games again: the stage machine, the two rounds it runs itself, and the one
 * award call every mind game shares.
 */

interface Props {
  /** The pet that runs the Quick maths track. */
  pet: PetState;
  onFinish: (metadata: BrainTrainingMetadata) => Promise<void>;
  onClose: () => void;
  /** Optional so the Mind section still stands alone if the daily puzzle isn't wired up. */
  onOpenWordPuzzle?: () => void;
  /** Same shape as {@link onOpenWordPuzzle}: Four Corners is its own screen, not a stage here. */
  onOpenFourCorners?: () => void;
  /** Same again — Pet Jeopardy owns a full board and a wager step, so it is its own route. */
  onOpenPetJeopardy?: () => void;
  events?: HealthEvent[];
}

/** `pick` is the hub; the rest are what this sheet plays and shows itself. */
type Stage = 'pick' | MindStage | 'quiz' | 'result';

const STAGE_TITLE: Record<Exclude<Stage, 'pick'>, string> = {
  math: 'Quick maths',
  reading: 'Read and recall',
  quiz: 'Read and recall',
  garden: 'Word garden',
  country: 'Guess the country',
  result: 'Train your mind',
};

interface SessionResult extends BrainTrainingMetadata {
  missed?: { prompt: string; chosen: string; answer: string }[];
  /** Plain lines for the result card, from games that have more to say than a score. */
  summary?: string[];
}

/** What the result card says under the score, per game. */
const resultMeta = (result: SessionResult): string => {
  switch (result.game) {
    case 'wordGarden':
    case 'spellingBee':
      return `${result.wordsFound ?? 0} ${result.wordsFound === 1 ? 'word' : 'words'} · ${result.points ?? 0} points${
        (result.bestMultiplier ?? 1) > 1 ? ` · best run ×${result.bestMultiplier}` : ''
      } · ${result.durationSeconds}s`;
    case 'countryGuess':
      return `${result.correct} of ${result.total} countries found · ${result.durationSeconds}s`;
    case 'math':
      return `${result.correct} of ${result.total} obstacles dodged · ${result.durationSeconds}s · best run ${result.bestStreak ?? 0}`;
    default:
      return `${result.correct} of ${result.total} right · ${result.durationSeconds}s`;
  }
};

export function MindGymScreen({
  pet,
  onFinish,
  onClose,
  onOpenWordPuzzle,
  onOpenFourCorners,
  onOpenPetJeopardy,
  events = [],
}: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [passage, setPassage] = useState<ReadingPassage | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The keyboard, tracked so a typing game's answer stays in view above it.
  const scroll = useRef<ScrollView>(null);
  const keyboardUp = useRef(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      keyboardUp.current = true;
      // Once the inset has been applied, bring the answer up into view.
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardUp.current = false;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const finishReading = (scored: { correct: number; total: number }, missed?: SessionResult['missed']) => {
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    setResult({
      game: 'reading',
      correct: scored.correct,
      total: scored.total,
      durationSeconds,
      score: mindScore({ game: 'reading', ...scored, durationSeconds }),
      passageId: passage?.id,
      passageTitle: passage?.title,
      missed,
    });
    setStage('result');
  };

  const startReading = () => {
    setPassage(pickReadingPassage(passage?.id));
    setAnswers({});
    setStartedAt(Date.now());
    setStage('reading');
  };

  /** The self-scoring games (the run included) hand back a result; the gym only shows and saves it. */
  const finishSession = (metadata: BrainTrainingMetadata, summary: string[]) => {
    setResult({ ...metadata, summary });
    setStage('result');
  };

  const submitQuiz = () => {
    if (!passage) return;
    const missed = passage.questions
      .filter((question) => answers[question.id] !== question.answerIndex)
      .map((question) => ({
        prompt: question.prompt,
        chosen: question.options[answers[question.id]] ?? 'No answer',
        answer: question.options[question.answerIndex],
      }));
    finishReading({ correct: passage.questions.length - missed.length, total: passage.questions.length }, missed);
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const { missed: _missed, summary: _summary, ...metadata } = result;
      await onFinish(metadata);
      logHaptic();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this session.'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * The registry decides which games exist; this says which of the ones that
   * own a route can be reached from here. Memoised because the hub keys its own
   * roster derivation on this object's identity, so a fresh literal each render
   * would re-derive the roster on every hub render for no reason.
   */
  const routes: MindRouteHandlers = useMemo(
    () => ({
      wordPuzzle: onOpenWordPuzzle,
      fourCorners: onOpenFourCorners,
      petJeopardy: onOpenPetJeopardy,
    }),
    [onOpenWordPuzzle, onOpenFourCorners, onOpenPetJeopardy],
  );

  /** The hub's one way in to a game this sheet plays itself. */
  const startStage = (next: MindStage) => {
    if (next === 'reading') {
      startReading();
      return;
    }
    setStage(next);
  };

  const allAnswered = useMemo(
    () => passage?.questions.every((question) => question.id in answers) ?? false,
    [passage, answers],
  );

  // Sessions already played today. One is the day's mind goal: it is what
  // marks the mind pillar done in the daily recap, so the bar is a real goal.
  const sessionsToday = useMemo(() => mindRecapForDay(events).sessionCount, [events]);

  if (stage === 'pick') {
    return (
      <SheetPage onBackPress={onClose}>
        <MindHub
          pet={pet}
          events={events}
          routes={routes}
          onStartStage={startStage}
          onClose={onClose}
        />
      </SheetPage>
    );
  }

  return (
    <SheetPage onBackPress={onClose}>
      {/* No KeyboardAvoidingView: inside a page sheet it measures from the
          wrong edge and left the keyboard over the answers. The scroll view
          insets itself by the keyboard instead (see below). */}
      <View style={styles.sheet}>
        <View style={styles.header}>
          {/* Flexed, so a long title at large text wraps instead of pushing × off the sheet. */}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{STAGE_TITLE[stage]}</Text>
          </View>
          <CloseButton onPress={onClose} />
        </View>

        {stage === 'result' ? (
          // The day's mind goal is one session: once it is met, another adds nothing
          // to it, so the bar shows it full rather than "1 +1 / 1".
          <LogProgress items={[{ label: 'Mind today', value: sessionsToday, goal: 1, adding: sessionsToday < 1 ? 1 : 0, unit: 'session' }]} />
        ) : null}

        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          // iOS insets the content by the keyboard, so everything can scroll
          // clear of it...
          automaticallyAdjustKeyboardInsets
          // ...and while the keyboard is up the answer (always at the bottom of
          // a typing game: the box, its suggestions, the button) is kept in view,
          // also as suggestions appear under it.
          onContentSizeChange={() => {
            if (keyboardUp.current) scroll.current?.scrollToEnd({ animated: true });
          }}
        >
          {stage === 'garden' ? <WordGardenGame onFinish={finishSession} onCancel={onClose} /> : null}

          {stage === 'country' ? <CountryGuessGame onFinish={finishSession} onCancel={onClose} /> : null}

          {stage === 'math' ? <MathRunGame pet={pet} onFinish={finishSession} /> : null}

          {stage === 'reading' && passage ? (
            <>
              <View style={styles.passage}>
                <Text style={styles.passageTitle}>{passage.title}</Text>
                {passage.body.split('\n\n').map((paragraph) => (
                  <Text key={paragraph.slice(0, 24)} style={styles.passageText}>
                    {paragraph}
                  </Text>
                ))}
              </View>
              <Text style={styles.note}>The passage is hidden once you continue — read it properly first.</Text>
            </>
          ) : null}

          {stage === 'quiz' && passage ? (
            <>
              {passage.questions.map((question, index) => (
                <View key={question.id} style={styles.question}>
                  <Text style={styles.questionPrompt}>
                    {index + 1}. {question.prompt}
                  </Text>
                  {question.options.map((option, optionIndex) => (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: answers[question.id] === optionIndex }}
                      onPress={() => setAnswers({ ...answers, [question.id]: optionIndex })}
                      style={({ pressed }) => [styles.option, pressed && styles.optionPressed, answers[question.id] === optionIndex && styles.optionOn]}
                    >
                      <Text
                        style={[
                          styles.optionLabel,
                          answers[question.id] === optionIndex && styles.optionLabelOn,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </>
          ) : null}

          {stage === 'result' && result ? (
            <>
              <View style={styles.resultCard} accessible accessibilityLabel={`Mind score ${result.score}, ${mindScoreLabel(result.score)}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultLabel}>{mindScoreLabel(result.score)}</Text>
                  <Text style={styles.resultMeta}>{resultMeta(result)}</Text>
                </View>
                {/* The score stacked over its unit, right-aligned like the meal page's calories. */}
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreNumber}>{result.score}</Text>
                  <Text style={styles.scoreCaption}>mind score</Text>
                </View>
              </View>

              {result.summary?.length ? (
                <View style={styles.review}>
                  {result.summary.map((line) => (
                    <View key={line} style={styles.reviewRow}>
                      <Text style={styles.reviewPrompt}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {result.missed?.length ? (
                <View style={styles.review}>
                  <Text style={styles.reviewTitle}>Missed</Text>
                  {result.missed.map((miss) => (
                    <View key={miss.prompt} style={styles.reviewRow}>
                      <Text style={styles.reviewPrompt}>{miss.prompt}</Text>
                      <Text style={styles.reviewDetail}>
                        You said “{miss.chosen}” · Answer: “{miss.answer}”
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

            </>
          ) : null}
        </ScrollView>

        {/* The stage's one action, pinned so it is never a scroll away. The
            games play their own buttons inside the scroll (some sit over a
            keyboard), so only the stages this sheet runs itself get a footer.
            Cancel is gone from here: the × in the header already does it. */}
        {stage === 'reading' && passage ? (
          <View style={styles.footer}>
            <PrimaryButton label="I've finished reading" onPress={() => setStage('quiz')} />
          </View>
        ) : null}
        {stage === 'quiz' && passage ? (
          <View style={styles.footer}>
            {allAnswered ? null : (
              <Text style={styles.footerSummary}>{`${Object.keys(answers).length} of ${passage.questions.length} answered`}</Text>
            )}
            <PrimaryButton
              label={allAnswered ? 'Check answers' : 'Answer every question'}
              disabled={!allAnswered}
              onPress={submitQuiz}
            />
          </View>
        ) : null}
        {stage === 'result' && result ? (
          <View style={styles.footer}>
            <ErrorText>{error}</ErrorText>
            <PrimaryButton
              label={saving ? 'Saving...' : 'Log session'}
              busy={saving}
              onPress={() => void save()}
            />
            <TextButton label="Play again" onPress={() => setStage('pick')} disabled={saving} />
          </View>
        ) : null}
      </View>
    </SheetPage>
  );
}

const styles = themedStyles(() => ({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 22,
  },
  title: { ...text.title, marginTop: 6 },
  body: { padding: 22, paddingBottom: 24 },
  passage: {
    padding: 20,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  passageTitle: { fontFamily: fonts.ui, fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  passageText: { ...text.body, marginBottom: 12 },
  note: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, marginTop: 12, textAlign: 'center' },
  question: { marginBottom: 24 },
  questionPrompt: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '600', color: colors.ink, marginBottom: 10, lineHeight: 24 },
  // Answers are chips on the card colour; the picked one takes the selected
  // fill, the same as a ticked food on the meal page.
  option: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    marginBottom: 6,
  },
  optionPressed: { backgroundColor: colors.cardSoft },
  optionOn: { backgroundColor: colors.selectedFill },
  optionLabel: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkSoft },
  optionLabelOn: { color: colors.coralDeep, fontWeight: '700' },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  scoreBox: { alignItems: 'flex-end', minWidth: 64 },
  scoreNumber: { fontFamily: fonts.ui, fontSize: 34, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  scoreCaption: { fontFamily: fonts.ui, fontSize: 11, color: colors.faint },
  resultLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  resultMeta: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 19 },
  review: { marginTop: 18, gap: 6 },
  reviewTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2, paddingHorizontal: 4 },
  reviewRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  reviewPrompt: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '500', color: colors.ink, lineHeight: 19 },
  reviewDetail: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, marginTop: 4, lineHeight: 18 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.paper },
  footerSummary: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSoft, textAlign: 'center', fontVariant: ['tabular-nums'] },
}));
