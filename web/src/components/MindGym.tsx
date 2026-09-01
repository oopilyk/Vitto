import { useEffect, useMemo, useRef, useState } from 'react';
import { type BrainTrainingMetadata, MATH_ROUND_SECONDS, type MathProblem, type ReadingPassage, errorMessage, generateMathProblem, mindScore, mindScoreLabel, pickReadingPassage } from '@vitto/core';

interface MindGymProps {
  onFinish: (metadata: BrainTrainingMetadata) => Promise<void>;
  onClose: () => void;
}

type Stage = 'pick' | 'math' | 'reading' | 'quiz' | 'result';

interface SessionResult extends BrainTrainingMetadata {
  missed?: { prompt: string; chosen: string; answer: string }[];
}

const FLASH_MS = 260;

export function MindGym({ onFinish, onClose }: MindGymProps) {
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answerInput = useRef<HTMLInputElement>(null);

  // The tally lives in state for rendering, but the timer that ends the round must
  // read the final values, so keep a ref in step with them.
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
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) finishRound('math', tally.current);
    };
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [stage, deadline]);

  useEffect(() => {
    if (stage === 'math') answerInput.current?.focus();
  }, [stage, problem]);

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

  const submitAnswer = (event: React.FormEvent) => {
    event.preventDefault();
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
    window.setTimeout(() => setFlash(null), FLASH_MS);
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
      setSaved(true);
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
    <div className="meal-modal" role="dialog" aria-modal="true" aria-labelledby="mind-title">
      <div className="meal-card mind-card">
        <div className="meal-card-heading">
          <div>
            <p className="kicker">MIND GYM</p>
            <h2 id="mind-title">
              {stage === 'math' ? 'Quick maths' : stage === 'reading' || stage === 'quiz' ? 'Read and recall' : 'Train your mind'}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {stage === 'pick' && (
          <>
            <p className="mind-intro">
              A few focused minutes counts as care too. Pick a session — your pet feels the difference either way.
            </p>
            <div className="mind-choices">
              <button type="button" onClick={startMath}>
                <span className="action-icon coral">∑</span>
                <span>
                  <b>Quick maths</b>
                  <small>{MATH_ROUND_SECONDS} seconds · gets harder as you go</small>
                </span>
                <strong>→</strong>
              </button>
              <button type="button" onClick={startReading}>
                <span className="action-icon mint">❧</span>
                <span>
                  <b>Read and recall</b>
                  <small>A short passage, then questions from memory</small>
                </span>
                <strong>→</strong>
              </button>
            </div>
          </>
        )}

        {stage === 'math' && problem && (
          <>
            <div className="mind-scoreboard">
              <span><b>{secondsLeft}s</b> left</span>
              <span><b>{correct}</b>/{total} correct</span>
              <span><b>{streak}</b> streak · tier {problem.tier}</span>
            </div>
            <form className={`mind-problem${flash ? ` mind-${flash}` : ''}`} onSubmit={submitAnswer}>
              <p className="mind-prompt">{problem.prompt}</p>
              <input
                ref={answerInput}
                type="number"
                inputMode="numeric"
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                placeholder="Your answer"
                aria-label="Your answer"
              />
              <button className="primary" type="submit">Enter <span>→</span></button>
            </form>
            <div className="meal-actions">
              <button className="text-button inline-cancel" onClick={() => finishRound('math', tally.current)}>
                End round early
              </button>
            </div>
          </>
        )}

        {stage === 'reading' && passage && (
          <>
            <article className="mind-passage">
              <h3>{passage.title}</h3>
              {passage.body.split('\n\n').map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </article>
            <p className="mind-note">The passage is hidden once you continue — read it properly first.</p>
            <div className="meal-actions">
              <button className="primary" onClick={() => setStage('quiz')}>
                I've finished reading <span>→</span>
              </button>
              <button className="text-button inline-cancel" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {stage === 'quiz' && passage && (
          <>
            <ol className="mind-quiz">
              {passage.questions.map((question) => (
                <li key={question.id}>
                  <p>{question.prompt}</p>
                  {question.options.map((option, index) => (
                    <label key={option} className={answers[question.id] === index ? 'mind-chosen' : ''}>
                      <input
                        type="radio"
                        name={question.id}
                        checked={answers[question.id] === index}
                        onChange={() => setAnswers({ ...answers, [question.id]: index })}
                      />
                      {option}
                    </label>
                  ))}
                </li>
              ))}
            </ol>
            <div className="meal-actions">
              <button className="primary" disabled={!allAnswered} onClick={submitQuiz}>
                {allAnswered ? 'Check answers' : 'Answer every question'} <span>→</span>
              </button>
              <button className="text-button inline-cancel" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {stage === 'result' && result && (
          <>
            <div className="analysis-result">
              <div className="grade-wrap">
                <div className="grade"><b>{result.score}</b><small>MIND SCORE</small></div>
              </div>
              <div className="analysis-copy">
                <h3>{mindScoreLabel(result.score)}</h3>
                <div className="macro-line">
                  <span><strong>{result.correct}</strong> of {result.total} right</span>
                  <span><strong>{result.durationSeconds}s</strong> taken</span>
                  {result.game === 'math' && <span><strong>{result.bestStreak}</strong> best streak</span>}
                </div>
              </div>
            </div>
            {result.missed?.length ? (
              <ul className="mind-review">
                {result.missed.map((miss) => (
                  <li key={miss.prompt}>
                    <b>{miss.prompt}</b>
                    <small>You said “{miss.chosen}” · Answer: “{miss.answer}”</small>
                  </li>
                ))}
              </ul>
            ) : null}
            {error && <p className="form-error">{error}</p>}
            {saved && <p className="auth-message">Session added to your care log.</p>}
            <div className="meal-actions">
              <button className="primary" disabled={saving} onClick={save}>
                {saving ? 'Saving...' : 'Add to care log'} <span>→</span>
              </button>
              <button className="text-button inline-cancel" disabled={saving} onClick={() => setStage('pick')}>
                Play again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
