import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import {
  type BrainTrainingMetadata,
  MATH_RUN_LIVES,
  MATH_RUN_SECONDS,
  type MathRunObstacle,
  type MathRunState,
  type PetState,
  advanceMathRun,
  answerMathRun,
  collideMathRun,
  createMathRun,
  endMathRun,
  mathRunLivesLeft,
  toMathRunMetadata,
} from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { PrimaryButton, TextButton } from '../components/ui';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { colors, fonts, layout } from '../theme';
import { Obstacle } from './Obstacle';
import {
  FALLBACK_TRACK_WIDTH,
  GROUND_HEIGHT,
  GROUND_LOOP_MS,
  GROUND_TILE,
  OBSTACLE_SIZE,
  OVER_HOLD_MS,
  PET_LEFT,
  PET_SIZE,
  RESOLVE_HOLD_MS,
  TICK_MS,
  TRACK_HEIGHT,
  approachX,
  clearedX,
  collisionX,
  dodgePlan,
  obstacleLabel,
} from './track';
import { useDodgeHop } from './useDodgeHop';

interface Props {
  pet: PetState;
  /** Called exactly once, when the run is over. The gym shows and saves the result. */
  onFinish: (metadata: BrainTrainingMetadata, summary: string[]) => void;
  /** Injected in tests so the first obstacle is known. */
  run?: MathRunState;
  /** Injected in tests: deals every obstacle after the first. */
  rng?: () => number;
}

/** The track's own palette — a pale sky over dry grass, in the app's muted register. */
const SKY = '#e3ebf1';
const GROUND = '#cfd9c7';
const GROUND_MARK = colors.mintDeep;

/** Under Reduce Motion the obstacle waits this far along the track and the countdown does the work. */
const STILL_PROGRESS = 0.55;
/** Long enough for the sheet's slide-in to finish before the keyboard is asked for. */
const FOCUS_DELAY_MS = 250;

const secondsUntil = (deadline: number, now: number): number => Math.max(0, Math.ceil((deadline - now) / 1000));

const summaryFor = (state: MathRunState): string[] => {
  if (state.faced === 0) return ['The run ended before the first obstacle arrived.'];
  return [
    state.hits >= MATH_RUN_LIVES
      ? `Three hits ended the run early, after ${state.faced} ${state.faced === 1 ? 'obstacle' : 'obstacles'}.`
      : `Ran the full ${MATH_RUN_SECONDS} seconds and faced ${state.faced} ${state.faced === 1 ? 'obstacle' : 'obstacles'}.`,
  ];
};

/**
 * Quick maths as a runner. The pet runs in place at the left of the track; an
 * obstacle carrying a sum rolls in from the right, and the answer typed before
 * it arrives is what makes the pet jump. The run itself lives in `@vitto/core`'s
 * `mathRun.ts` — the transitions there refuse anything out of turn, which is
 * what makes a rapid double-submit a no-op. This file owns the clock, the
 * approach animation and the single `onFinish` call.
 */
export function MathRunGame({ pet, onFinish, run: initialRun, rng = Math.random }: Props) {
  const [run, setRun] = useState<MathRunState>(() => initialRun ?? createMathRun(rng));
  const runRef = useRef(run);
  const startedAtRef = useRef(Date.now());
  const runDeadlineRef = useRef(startedAtRef.current + MATH_RUN_SECONDS * 1000);
  const obstacleDeadlineRef = useRef(startedAtRef.current + run.obstacle.windowMs);
  const finishedRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(MATH_RUN_SECONDS);
  const [obstacleSecondsLeft, setObstacleSecondsLeft] = useState(() =>
    Math.ceil(run.obstacle.windowMs / 1000),
  );
  const [entry, setEntry] = useState('');
  const [trackWidth, setTrackWidth] = useState(FALLBACK_TRACK_WIDTH);

  const reduceMotion = useReducedMotion();
  const dodge = useDodgeHop(reduceMotion);
  /** The obstacle's left edge, in points from the track's left edge. */
  const obstacleX = useRef(new Animated.Value(FALLBACK_TRACK_WIDTH)).current;
  const ground = useRef(new Animated.Value(0)).current;
  const hopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The keyboard is the game's controller, so the answer box is focused for the
   * player rather than waited on. `autoFocus` alone is not reliable inside a
   * presented sheet (the input can mount before the sheet's window can take
   * focus), so focus is also asked for once the sheet has settled, again on each
   * new obstacle, and after every answer in case tapping Jump took it.
   */
  const inputRef = useRef<TextInput>(null);
  const focusInput = () => inputRef.current?.focus?.();
  useEffect(() => {
    const timer = setTimeout(focusInput, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (hopTimer.current) clearTimeout(hopTimer.current);
    holdTimer.current = null;
    hopTimer.current = null;
  };

  /** The ref and the state always move together — the ref is what a same-tick second submit sees. */
  const commit = (next: MathRunState) => {
    runRef.current = next;
    setRun(next);
  };

  /** How far through its window the approaching obstacle is, 0 at spawn and 1 at the pet. */
  const approachProgress = (now: number): number => {
    const { windowMs } = runRef.current.obstacle;
    return windowMs > 0 ? 1 - (obstacleDeadlineRef.current - now) / windowMs : 1;
  };

  /**
   * Starts (or, after a layout change, re-aims) the approach: from wherever the
   * obstacle is along its line to the collision point, arriving on the deadline.
   */
  const aimApproach = (width: number) => {
    obstacleX.stopAnimation();
    if (reduceMotion) {
      obstacleX.setValue(approachX(STILL_PROGRESS, width));
      return;
    }
    const now = Date.now();
    obstacleX.setValue(approachX(approachProgress(now), width));
    Animated.timing(obstacleX, {
      toValue: collisionX(),
      duration: Math.max(0, obstacleDeadlineRef.current - now),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };

  const spawn = (obstacle: MathRunObstacle) => {
    obstacleDeadlineRef.current = Date.now() + obstacle.windowMs;
    setObstacleSecondsLeft(Math.ceil(obstacle.windowMs / 1000));
    aimApproach(trackWidth);
    focusInput();
  };

  // The first obstacle is already on the clock from the initial refs; only its
  // animation needs kicking off. Later ones go through `spawn` on advance. This
  // also re-aims after the track reports its real width, so the first obstacle
  // is never left flying a line drawn for the fallback width.
  useEffect(() => {
    if (runRef.current.status === 'running') aimApproach(trackWidth);
    // `aimApproach` reads only refs besides these two.
  }, [reduceMotion, trackWidth]);

  // The ground's markers slide left for as long as the pet is running.
  const over = run.status === 'over';
  useEffect(() => {
    if (reduceMotion || over) {
      ground.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ground, { toValue: 1, duration: GROUND_LOOP_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [ground, over, reduceMotion]);

  const finishRun = (final: MathRunState) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearHold();
    obstacleX.stopAnimation();
    const ended = endMathRun(final);
    commit(ended);
    onFinish(toMathRunMetadata(ended, (Date.now() - startedAtRef.current) / 1000), summaryFor(ended));
  };

  /** Every resolution — an answer or a collision — lands here. */
  const resolveWith = (next: MathRunState) => {
    const live = runRef.current;
    // Identical by reference means the run refused it (mid-jump, or already over).
    if (next === live) return;
    const now = Date.now();
    // Where the obstacle is at this instant, before the run state moves on.
    const currentX = approachX(reduceMotion ? STILL_PROGRESS : approachProgress(now), trackWidth);
    commit(next);
    setEntry('');
    obstacleX.stopAnimation();
    clearHold();

    let holdMs = RESOLVE_HOLD_MS;
    if (next.status === 'dodging') {
      // The obstacle rushes on under the pet and the hop is timed to meet it:
      // the pet is at the top of its arc as the obstacle's centre passes its own.
      const plan = dodgePlan(currentX);
      holdMs = plan.holdMs;
      if (reduceMotion) {
        obstacleX.setValue(clearedX());
      } else {
        obstacleX.setValue(currentX);
        Animated.timing(obstacleX, {
          toValue: clearedX(),
          duration: plan.dashMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
        hopTimer.current = setTimeout(dodge.hop, plan.hopDelayMs);
      }
    } else {
      // A hit: the obstacle stays where it got the pet.
      obstacleX.setValue(reduceMotion ? currentX : Math.max(collisionX(), currentX));
      dodge.stumble();
    }

    if (next.status === 'over') {
      holdTimer.current = setTimeout(() => finishRun(runRef.current), OVER_HOLD_MS);
      return;
    }
    holdTimer.current = setTimeout(() => {
      const advanced = advanceMathRun(runRef.current, rng);
      if (advanced === runRef.current) return;
      commit(advanced);
      spawn(advanced.obstacle);
    }, holdMs);
  };

  const tick = () => {
    const now = Date.now();
    const remaining = secondsUntil(runDeadlineRef.current, now);
    setSecondsLeft(remaining);
    const live = runRef.current;
    if (remaining === 0) {
      finishRun(live);
      return;
    }
    if (live.status !== 'running') return;
    setObstacleSecondsLeft(secondsUntil(obstacleDeadlineRef.current, now));
    if (now >= obstacleDeadlineRef.current) resolveWith(collideMathRun(live));
  };

  // One interval for the whole run, reading the latest handlers through a ref so
  // it never has to be torn down and re-armed as state changes.
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    const timer = setInterval(() => tickRef.current(), TICK_MS);
    return () => {
      clearInterval(timer);
      clearHold();
      obstacleX.stopAnimation();
    };
    // Mount-only: everything it needs lives in refs.
  }, []);

  const submit = () => {
    if (entry.trim() === '') return;
    const value = Number(entry);
    // A stray character is not an answer; leave it for the player to fix.
    if (!Number.isFinite(value)) return;
    resolveWith(answerMathRun(runRef.current, value));
    focusInput();
  };

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== trackWidth) setTrackWidth(width);
  };

  const groundX = ground.interpolate({ inputRange: [0, 1], outputRange: [0, -GROUND_TILE] });
  const markCount = Math.ceil(trackWidth / GROUND_TILE) + 2;

  const { obstacle, lastOutcome } = run;
  const livesLeft = mathRunLivesLeft(run);
  const flash = run.status === 'dodging' ? 'right' : run.status === 'hit' || over ? 'wrong' : null;

  const feedback = (() => {
    if (run.status === 'dodging') return 'DODGED!';
    if (run.status === 'hit' || (over && lastOutcome && run.hits >= MATH_RUN_LIVES)) {
      return `HIT · ${lastOutcome?.entered === null ? 'too slow' : 'not that'} · ${lastOutcome?.problem.prompt} = ${lastOutcome?.problem.answer}`;
    }
    if (over) return 'RUN OVER';
    return null;
  })();

  return (
    <>
      <View style={styles.scoreboard}>
        <Text style={styles.scoreItem}>
          <Text style={styles.scoreValue}>{secondsLeft}s</Text> left
        </Text>
        <Text style={styles.scoreItem}>
          <Text style={styles.scoreValue}>{run.dodged}</Text> dodged
        </Text>
        <Text style={styles.scoreItem}>
          <Text style={styles.scoreValue}>{run.streak}</Text> streak · tier {obstacle.problem.tier}
        </Text>
        <Text style={styles.scoreItem} accessibilityLabel={`${livesLeft} of ${MATH_RUN_LIVES} lives left`}>
          <Text style={[styles.scoreValue, styles.hearts]}>
            {'♥'.repeat(livesLeft)}
            <Text style={styles.heartLost}>{'♥'.repeat(MATH_RUN_LIVES - livesLeft)}</Text>
          </Text>
        </Text>
      </View>

      <View style={styles.track} onLayout={onTrackLayout}>
        <View style={styles.ground}>
          <Animated.View style={[styles.groundMarks, { width: markCount * GROUND_TILE, transform: [{ translateX: groundX }] }]}>
            {Array.from({ length: markCount }, (_, index) => (
              <View key={index} style={styles.groundMark} />
            ))}
          </Animated.View>
        </View>

        {/* Drawn before the pet so a dodged obstacle passes under it, not through it. */}
        <Animated.View
          accessibilityRole="image"
          accessibilityLabel={obstacleLabel(obstacle.kind, obstacleSecondsLeft)}
          style={[styles.obstacle, { transform: [{ translateX: obstacleX }] }]}
        >
          <Obstacle kind={obstacle.kind} />
        </Animated.View>

        <Animated.View pointerEvents="none" style={[styles.petLayer, { transform: dodge.transform }]}>
          <PetAvatar
            pet={pet}
            {...IDLE_ACTIVITY}
            isExploring={!over}
            hideStatusCaption
            size={PET_SIZE}
            stageStyle={styles.petStage}
          />
        </Animated.View>

        <View style={styles.countdown}>
          <Text style={styles.countdownText}>
            {run.status === 'running' ? `${obstacleSecondsLeft}s to dodge` : ' '}
          </Text>
        </View>
      </View>

      {/* A fixed-height slot so the card never jumps when the verdict appears. */}
      <View style={styles.feedbackSlot} accessibilityLiveRegion="polite">
        {feedback ? (
          <Text style={[styles.feedback, flash === 'right' ? styles.feedbackRight : styles.feedbackWrong]}>{feedback}</Text>
        ) : null}
      </View>

      <View style={[styles.problem, flash === 'right' && styles.problemRight, flash === 'wrong' && styles.problemWrong]}>
        <Text style={styles.prompt}>{obstacle.problem.prompt}</Text>
        <TextInput
          ref={inputRef}
          style={[layout.input, styles.answerInput]}
          keyboardType="numbers-and-punctuation"
          value={entry}
          onChangeText={setEntry}
          onSubmitEditing={submit}
          placeholder="Solve it to jump"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Your answer"
          autoFocus
          blurOnSubmit={false}
          returnKeyType="done"
          editable={!over}
        />
        <PrimaryButton label="Jump" onPress={submit} disabled={over} />
      </View>
      <View style={styles.actions}>
        <TextButton label="End run early" onPress={() => finishRun(runRef.current)} disabled={over} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scoreboard: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 14 },
  scoreItem: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  scoreValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  hearts: { color: colors.coral, letterSpacing: 1 },
  heartLost: { color: colors.hairline },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: SKY,
    overflow: 'hidden',
    marginBottom: 10,
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: GROUND_HEIGHT,
    backgroundColor: GROUND,
    borderTopWidth: 2,
    borderTopColor: GROUND_MARK,
    overflow: 'hidden',
  },
  groundMarks: { flexDirection: 'row', position: 'absolute', left: 0, top: 14 },
  groundMark: { width: 14, height: 3, borderRadius: 2, backgroundColor: GROUND_MARK, marginRight: GROUND_TILE - 14, opacity: 0.6 },
  petLayer: { position: 'absolute', left: PET_LEFT, bottom: GROUND_HEIGHT - 12 },
  petStage: { width: PET_SIZE, height: PET_SIZE, backgroundColor: 'transparent', overflow: 'visible' },
  obstacle: {
    position: 'absolute',
    left: 0,
    bottom: GROUND_HEIGHT - 4,
    width: OBSTACLE_SIZE,
    height: OBSTACLE_SIZE,
    justifyContent: 'flex-end',
  },
  countdown: { position: 'absolute', top: 10, right: 12 },
  countdownText: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, letterSpacing: 0.6 },
  feedbackSlot: { height: 22, justifyContent: 'center', marginBottom: 6 },
  feedback: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.8, textAlign: 'center' },
  feedbackRight: { color: colors.mintDeep },
  feedbackWrong: { color: colors.coralDeep },
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
  actions: { marginTop: 24, gap: 16 },
});
