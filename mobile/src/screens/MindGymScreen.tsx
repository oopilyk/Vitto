import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, KeyboardAvoidingView, Platform } from 'react-native';
import { type BrainTrainingMetadata, type HealthEvent, type PetState, type ReadingPassage, errorMessage, mindScore, mindScoreLabel, pickReadingPassage } from '@vitto/core';
import { CountryGuessGame } from '../components/CountryGuessGame';
import { WordGardenGame } from '../components/WordGardenGame';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { MathRunGame } from '../mathRun/MathRunGame';
import { MindHub } from '../mind/MindHub';
import type { MindRouteHandlers } from '../mind/hub';
import type { MindStage } from '../mind/types';
import { colors, fonts, text } from '../theme';

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

  if (stage === 'pick') {
    return (
      <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <MindHub
          pet={pet}
          events={events}
          routes={routes}
          onStartStage={startStage}
          onClose={onClose}
        />
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View>
            <Kicker>Mind</Kicker>
            <Text style={styles.title}>{STAGE_TITLE[stage]}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Text style={styles.closeMark}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
              <View style={styles.actions}>
                <PrimaryButton label="I've finished reading" onPress={() => setStage('quiz')} />
                <TextButton label="Cancel" onPress={onClose} />
              </View>
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
                      onPress={() => setAnswers({ ...answers, [question.id]: optionIndex })}
                      style={[styles.option, answers[question.id] === optionIndex && styles.optionOn]}
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
              <View style={styles.actions}>
                <PrimaryButton
                  label={allAnswered ? 'Check answers' : 'Answer every question'}
                  disabled={!allAnswered}
                  onPress={submitQuiz}
                />
                <TextButton label="Cancel" onPress={onClose} />
              </View>
            </>
          ) : null}

          {stage === 'result' && result ? (
            <>
              <View style={styles.resultCard}>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreNumber}>{result.score}</Text>
                  <Text style={styles.scoreCaption}>MIND SCORE</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultLabel}>{mindScoreLabel(result.score)}</Text>
                  <Text style={styles.resultMeta}>{resultMeta(result)}</Text>
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

              <ErrorText>{error}</ErrorText>
              <View style={styles.actions}>
                <PrimaryButton
                  label={saving ? 'Saving...' : 'Add to care log'}
                  busy={saving}
                  onPress={() => void save()}
                />
                <TextButton label="Play again" onPress={() => setStage('pick')} disabled={saving} />
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
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
  passage: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  passageTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.ink, marginBottom: 12 },
  passageText: { ...text.body, marginBottom: 12 },
  note: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 12 },
  question: { marginBottom: 22 },
  questionPrompt: { fontSize: 15, fontWeight: '500', color: colors.ink, marginBottom: 10, lineHeight: 21 },
  option: {
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    marginBottom: 7,
  },
  optionOn: { borderColor: colors.coral, backgroundColor: '#fbf1ee' },
  optionLabel: { fontSize: 14, color: colors.inkSoft },
  optionLabelOn: { color: colors.ink },
  resultCard: {
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
  resultLabel: { fontSize: 17, fontWeight: '600', color: colors.ink },
  resultMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 17 },
  review: { marginTop: 16, gap: 10 },
  reviewRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e2db',
    backgroundColor: colors.card,
  },
  reviewPrompt: { fontSize: 13, fontWeight: '500', color: colors.ink },
  reviewDetail: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 4, lineHeight: 15 },
  actions: { marginTop: 24, gap: 16 },
});
