import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { type BrainTrainingMetadata, MATH_ROUND_SECONDS, type MathProblem, type ReadingPassage, errorMessage, generateMathProblem, mindScore, mindScoreLabel, pickReadingPassage } from '@vitto/core';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  onFinish: (metadata: BrainTrainingMetadata) => Promise<void>;
  onClose: () => void;
}

type Stage = 'pick' | 'math' | 'reading' | 'quiz' | 'result';

interface SessionResult extends BrainTrainingMetadata {
  missed?: { prompt: string; chosen: string; answer: string }[];
}

export function MindGymScreen({ onFinish, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [problem, setProblem] = useState<MathProblem | null>(null);
  const [entry, setEntry] = useState('');
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(MATH_ROUND_SECONDS);
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const [passage, setPassage] = useState<ReadingPassage | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tally = useRef({ correct: 0, total: 0, bestStreak: 0 });

  const finishRound = (
    game: 'math' | 'reading',
    scored: { correct: number; total: number },
    missed?: SessionResult['missed'],
  ) => {
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    setResult({
      game,
      correct: scored.correct,
      total: scored.total,
      durationSeconds,
      score: mindScore({ game, ...scored, durationSeconds }),
      bestStreak: game === 'math' ? tally.current.bestStreak : undefined,
      passageId: game === 'reading' ? passage?.id : undefined,
      passageTitle: game === 'reading' ? passage?.title : undefined,
      missed,
    });
    setStage('result');
  };

  useEffect(() => {
    if (stage !== 'math') return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) finishRound('math', tally.current);
    }, 250);
    return () => clearInterval(timer);
  }, [stage, deadline]);

  const startMath = () => {
    tally.current = { correct: 0, total: 0, bestStreak: 0 };
    setCorrect(0);
    setTotal(0);
    setStreak(0);
    setEntry('');
    setProblem(generateMathProblem(0));
    setSecondsLeft(MATH_ROUND_SECONDS);
    setStartedAt(Date.now());
    setDeadline(Date.now() + MATH_ROUND_SECONDS * 1000);
    setStage('math');
  };

  const startReading = () => {
    setPassage(pickReadingPassage(passage?.id));
    setAnswers({});
    setStartedAt(Date.now());
    setStage('reading');
  };

  const submitAnswer = () => {
    if (!problem || entry.trim() === '') return;
    const isRight = Number(entry) === problem.answer;
    const nextStreak = isRight ? streak + 1 : 0;
    tally.current = {
      correct: tally.current.correct + (isRight ? 1 : 0),
      total: tally.current.total + 1,
      bestStreak: Math.max(tally.current.bestStreak, nextStreak),
    };
    setCorrect(tally.current.correct);
    setTotal(tally.current.total);
    setStreak(nextStreak);
    setFlash(isRight ? 'right' : 'wrong');
    setTimeout(() => setFlash(null), 260);
    setEntry('');
    setProblem(generateMathProblem(nextStreak));
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
    finishRound(
      'reading',
      { correct: passage.questions.length - missed.length, total: passage.questions.length },
      missed,
    );
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const { missed: _missed, ...metadata } = result;
      await onFinish(metadata);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this session.'));
    } finally {
      setSaving(false);
    }
  };

  const allAnswered = useMemo(
    () => passage?.questions.every((question) => question.id in answers) ?? false,
    [passage, answers],
  );

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View>
            <Kicker>Mind gym</Kicker>
            <Text style={styles.title}>
              {stage === 'math'
                ? 'Quick maths'
                : stage === 'reading' || stage === 'quiz'
                  ? 'Read and recall'
                  : 'Train your mind'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Text style={styles.closeMark}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {stage === 'pick' ? (
            <>
              <Text style={styles.intro}>
                A few focused minutes counts as care too. Pick a session — your pet feels the difference
                either way.
              </Text>
              <Pressable style={styles.gameCard} onPress={startMath}>
                <View style={[styles.gameIcon, { backgroundColor: colors.coralWash }]}>
                  <Text style={{ color: colors.coralDeep, fontSize: 18 }}>∑</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gameName}>Quick maths</Text>
                  <Text style={styles.gameHint}>{MATH_ROUND_SECONDS} seconds · gets harder as you go</Text>
                </View>
                <Text style={styles.gameArrow}>→</Text>
              </Pressable>
              <Pressable style={styles.gameCard} onPress={startReading}>
                <View style={[styles.gameIcon, { backgroundColor: colors.mint }]}>
                  <Text style={{ color: colors.mintDeep, fontSize: 18 }}>❧</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gameName}>Read and recall</Text>
                  <Text style={styles.gameHint}>A short passage, then questions from memory</Text>
                </View>
                <Text style={styles.gameArrow}>→</Text>
              </Pressable>
            </>
          ) : null}

          {stage === 'math' && problem ? (
            <>
              <View style={styles.scoreboard}>
                <Text style={styles.scoreItem}>
                  <Text style={styles.scoreValue}>{secondsLeft}s</Text> left
                </Text>
                <Text style={styles.scoreItem}>
                  <Text style={styles.scoreValue}>{correct}</Text>/{total} correct
                </Text>
                <Text style={styles.scoreItem}>
                  <Text style={styles.scoreValue}>{streak}</Text> streak · tier {problem.tier}
                </Text>
              </View>
              <View
                style={[
                  styles.problem,
                  flash === 'right' && styles.problemRight,
                  flash === 'wrong' && styles.problemWrong,
                ]}
              >
                <Text style={styles.prompt}>{problem.prompt}</Text>
                <TextInput
                  style={[layout.input, styles.answerInput]}
                  keyboardType="numbers-and-punctuation"
                  value={entry}
                  onChangeText={setEntry}
                  onSubmitEditing={submitAnswer}
                  placeholder="Your answer"
                  placeholderTextColor={colors.faint}
                  autoFocus
                  returnKeyType="done"
                />
                <PrimaryButton label="Enter" onPress={submitAnswer} />
              </View>
              <View style={styles.actions}>
                <TextButton label="End round early" onPress={() => finishRound('math', tally.current)} />
              </View>
            </>
          ) : null}

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
                  <Text style={styles.resultMeta}>
                    {result.correct} of {result.total} right · {result.durationSeconds}s
                    {result.game === 'math' ? ` · ${result.bestStreak} best streak` : ''}
                  </Text>
                </View>
              </View>

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
      </View>
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
  intro: { ...text.body, marginBottom: 18 },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 14,
    marginBottom: 12,
  },
  gameIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gameName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  gameHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  gameArrow: { fontSize: 18, color: colors.faint },
  scoreboard: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 14 },
  scoreItem: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  scoreValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  problem: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.3)',
    backgroundColor: colors.sageSoft,
    gap: 14,
  },
  problemRight: { borderColor: '#8fae91', backgroundColor: '#dcecdb' },
  problemWrong: { borderColor: '#d8a396', backgroundColor: '#f5e3de' },
  prompt: { fontFamily: fonts.display, fontSize: 42, color: colors.ink, textAlign: 'center' },
  answerInput: { textAlign: 'center', fontSize: 20, fontWeight: '600' },
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
