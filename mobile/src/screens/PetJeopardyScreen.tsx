import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  type BrainTrainingMetadata,
  type JeopardyGame,
  type PetState,
  answerJeopardyCell,
  answerJeopardyFinal,
  closeJeopardyReveal,
  completeJeopardy,
  createJeopardyGame,
  errorMessage,
  jeopardyAnsweredCount,
  jeopardyBoardXp,
  jeopardyCategories,
  jeopardyFinalQuestions,
  jeopardyQuestions,
  maxJeopardyWager,
  openJeopardyCell,
  openJeopardyCellOf,
  setJeopardyWager,
  toJeopardyMetadata,
  totalPetXp,
} from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { ErrorText, PrimaryButton } from '../components/ui';
import { FALLBACK_PLAY_SIZE, JUMP_MS, type PlaySize, REDUCED_JUMP_MS, petSizeFor } from '../fourCorners/corners';
import { usePetJump } from '../fourCorners/usePetJump';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { JeopardyBoard } from '../petJeopardy/JeopardyBoard';
import {
  JeopardyFrame,
  JeopardyHeader,
  JeopardyUnavailable,
  progressLine,
} from '../petJeopardy/JeopardyChrome';
import { JeopardyResults } from '../petJeopardy/JeopardyResults';
import { PointsFlourish } from '../petJeopardy/PointsFlourish';
import { QuestionStage, type StageReveal } from '../petJeopardy/QuestionStage';
import { WagerPanel } from '../petJeopardy/WagerPanel';
import {
  DEFAULT_WAGER,
  FINAL_PET_SCALE,
  FINAL_SUSPENSE_MS,
  REVEAL_HOLD_MS,
  finalVerdictLine,
  petHopOffset,
  verdictLine,
} from '../petJeopardy/board';
import { isNightTime } from '../petWorld/timeOfDay';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';

interface Props {
  pet: PetState;
  /** Records the session as a BRAIN_TRAINING event. Called at most once per game. */
  onFinish: (metadata: BrainTrainingMetadata) => Promise<void>;
  onClose: () => void;
  /** Injected by tests so the board and answer placement are known. */
  game?: JeopardyGame;
}

interface Deal {
  game: JeopardyGame | null;
  error: string | null;
}

/**
 * `createJeopardyGame` throws on an empty or incomplete pool rather than dealing
 * a board with a hole in it, so every entry point into a new game goes through
 * this — a missing data file becomes one readable line on screen instead of a
 * crash inside a `useState` initialiser.
 */
const dealGame = (pet: PetState): Deal => {
  try {
    return {
      game: createJeopardyGame({
        categories: jeopardyCategories,
        pool: jeopardyQuestions,
        finalPool: jeopardyFinalQuestions,
        // Read at deal time, once: the ceiling the player is shown when they set
        // their stake has to be the ceiling they are actually held to.
        baselineXp: totalPetXp(pet),
      }),
      error: null,
    };
  } catch (cause) {
    return { game: null, error: errorMessage(cause, 'This board is unavailable right now.') };
  }
};

/**
 * Pet Jeopardy: a nine-square trivia board, then one Final question the player
 * wagers real pet xp on.
 *
 * The game itself lives entirely in `@vitto/core`. Every transition there
 * returns the SAME REFERENCE when called out of turn, and that reference check
 * is the whole anti-double-score story — there is not one local boolean guard in
 * this file. What this screen owns is the clock, the pet's hop, and the single
 * `onFinish` call.
 */
export function PetJeopardyScreen({ pet, onFinish, onClose, game }: Props) {
  const [deal, setDeal] = useState<Deal>(() => (game ? { game, error: null } : dealGame(pet)));
  const active = deal.game;

  const gameRef = useRef<JeopardyGame | null>(active);
  const startedAtRef = useRef(Date.now());
  const finishedAtRef = useRef<number | null>(active?.status === 'complete' ? Date.now() : null);
  const submittedRef = useRef(false);
  /** `onClose` is `navigation.goBack()`; calling it twice would pop two screens. */
  const closedRef = useRef(false);

  /**
   * Gates the reveal: the answer resolves when the pet lands, not when the tap
   * registered. A game injected mid-reveal starts settled — nothing is going to
   * fire the landing timer for a hop that already happened.
   */
  const [landed, setLanded] = useState(
    active?.status === 'revealing' || active?.status === 'finalRevealing',
  );
  const [stageSize, setStageSize] = useState<PlaySize>(FALLBACK_PLAY_SIZE);
  /** Null until the player touches the stepper, so the default can follow the ceiling. */
  const [wager, setWager] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reduceMotion = useReducedMotion();
  const jump = usePetJump(reduceMotion);
  const jumpMs = reduceMotion ? REDUCED_JUMP_MS : JUMP_MS;
  // Read once on mount: a game is over long before the clock could tip into
  // night, and a palette that flipped mid-question would be a distraction.
  const [night] = useState(() => isNightTime());

  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    revealTimer.current = null;
    advanceTimer.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /** The ref and the state always move together — the ref is what a same-tick second tap sees. */
  const commitGame = useCallback((next: JeopardyGame) => {
    gameRef.current = next;
    setDeal({ game: next, error: null });
  }, []);

  const onPetStageLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setStageSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const handlePick = (cellId: string) => {
    const current = gameRef.current;
    if (!current) return;
    const next = openJeopardyCell(current, cellId);
    // Identical by reference means the board refused the tap (already played, or
    // not the board's turn). No local `opening` flag — the domain owns that guard.
    if (next === current) return;
    setLanded(false);
    jump.returnToCentre();
    commitGame(next);
  };

  const handleAnswer = (index: number) => {
    const current = gameRef.current;
    if (!current) return;
    const isFinal = current.status === 'final';
    const next = isFinal ? answerJeopardyFinal(current, index) : answerJeopardyCell(current, index);
    if (next === current) return;

    commitGame(next);
    setLanded(false);
    clearTimers();

    if (isFinal) {
      const correct = Boolean(next.final?.correct);
      // The Final's one deliberate pause. The pet holds still and the tiles stay
      // neutral until the beat is up — hopping on the tap would give the verdict
      // away before the suspense had a chance to exist.
      revealTimer.current = setTimeout(() => {
        setLanded(true);
        jump.jumpTo(petHopOffset(correct, stageSize));
      }, FINAL_SUSPENSE_MS);
      return;
    }

    // A board square, by contrast, reacts on the tap: the hop IS the feedback,
    // and the tiles resolve as the pet touches down.
    jump.jumpTo(petHopOffset(Boolean(openJeopardyCellOf(next)?.correct), stageSize));
    revealTimer.current = setTimeout(() => setLanded(true), jumpMs);
    advanceTimer.current = setTimeout(() => {
      const live = gameRef.current;
      if (!live) return;
      const closed = closeJeopardyReveal(live);
      if (closed === live) return;
      setLanded(false);
      jump.returnToCentre();
      commitGame(closed);
    }, jumpMs + REVEAL_HOLD_MS);
  };

  const handleWager = (amount: number) => {
    const current = gameRef.current;
    if (!current) return;
    const next = setJeopardyWager(current, amount);
    // Refused by reference for an amount outside the ceiling, so a malformed
    // stake cannot reach the Final even if the panel's own clamp were wrong.
    if (next === current) return;
    setLanded(false);
    jump.returnToCentre();
    commitGame(next);
  };

  const handleSeeResults = () => {
    const current = gameRef.current;
    if (!current) return;
    const next = completeJeopardy(current);
    if (next === current) return;
    finishedAtRef.current = Date.now();
    clearTimers();
    jump.returnToCentre();
    commitGame(next);
  };

  const buildMetadata = (source: JeopardyGame): BrainTrainingMetadata =>
    toJeopardyMetadata(source, ((finishedAtRef.current ?? Date.now()) - startedAtRef.current) / 1000);

  /**
   * The one award path. Resolves `true` when there is nothing left owing —
   * either it has just been recorded, or it already was, or nothing was
   * answered. A rejection un-arms the guard so the user can try again rather
   * than losing the session to a network blip.
   */
  const submit = async (source: JeopardyGame): Promise<boolean> => {
    if (submittedRef.current || jeopardyAnsweredCount(source) === 0) return true;
    submittedRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onFinish(buildMetadata(source));
      setSaving(false);
      return true;
    } catch (cause) {
      submittedRef.current = false;
      setSaveError(errorMessage(cause, 'Could not save this game. Try again.'));
      setSaving(false);
      return false;
    }
  };

  /**
   * Leaving mid-game still banks what was earned — the metadata totals only what
   * was actually answered. Every exit runs through here, the hardware back
   * button and the sheet's own dismiss included, so a game can never be
   * abandoned after its reward has been shown.
   */
  const handleClose = async () => {
    if (saving || closedRef.current) return;
    clearTimers();
    const live = gameRef.current;
    if (live && !(await submit(live))) return;
    closedRef.current = true;
    onClose();
  };

  const handlePlayAgain = async () => {
    if (saving) return;
    const live = gameRef.current;
    if (live && !(await submit(live))) return;
    const next = dealGame(pet);
    if (!next.game) {
      setSaveError(next.error);
      return;
    }
    // Only now, with the previous game safely recorded, does the new one get a
    // fresh guard and a fresh clock.
    submittedRef.current = false;
    finishedAtRef.current = null;
    startedAtRef.current = Date.now();
    setSaveError(null);
    setLanded(false);
    setWager(null);
    jump.returnToCentre();
    commitGame(next.game);
  };

  // Android's hardware back and the sheet's own dismiss both land here rather
  // than popping the route behind our back.
  const requestClose = () => void handleClose();

  if (!active) {
    return (
      <Modal {...SHEET} onRequestClose={onClose}>
        <JeopardyFrame night={night} centred>
          <JeopardyUnavailable
            night={night}
            message={deal.error ?? 'This game is unavailable right now.'}
            onClose={onClose}
          />
        </JeopardyFrame>
      </Modal>
    );
  }

  const openCell = openJeopardyCellOf(active);
  const max = maxJeopardyWager(active.baselineXp);
  const amount = Math.min(wager ?? DEFAULT_WAGER, max);

  const petSlot = (size: number) => (
    <Animated.View pointerEvents="none" style={[styles.petLayer, { transform: jump.transform }]}>
      <PetAvatar
        pet={pet}
        {...IDLE_ACTIVITY}
        isCelebrating={landed && Boolean(openCell?.correct ?? active.final?.correct)}
        hideStatusCaption
        size={size}
        stageStyle={styles.petStage}
      />
    </Animated.View>
  );

  const boardReveal: StageReveal | null =
    landed && active.status === 'revealing' && openCell && openCell.chosenIndex !== null
      ? {
          correctIndex: openCell.correctIndex,
          chosenIndex: openCell.chosenIndex,
          correct: Boolean(openCell.correct),
          line: verdictLine(Boolean(openCell.correct), openCell.value, openCell.options[openCell.correctIndex]),
        }
      : null;

  const final = active.final;
  const finalReveal: StageReveal | null =
    landed && active.status === 'finalRevealing' && final && final.chosenIndex !== null
      ? {
          correctIndex: final.correctIndex,
          chosenIndex: final.chosenIndex,
          correct: Boolean(final.correct),
          line: finalVerdictLine(Boolean(final.correct), active.wager ?? 0, final.options[final.correctIndex]),
        }
      : null;

  const categoryLabel = (categoryId: string): string =>
    active.categories.find((category) => category.id === categoryId)?.label ?? categoryId;

  return (
    <Modal {...SHEET} onRequestClose={requestClose}>
      <JeopardyFrame night={night}>
        <JeopardyHeader
          night={night}
          progress={progressLine(active)}
          onClose={handleClose}
          closeDisabled={saving}
        />

        {active.status === 'board' ? (
          <JeopardyBoard game={active} night={night} onPick={handlePick} />
        ) : null}

        {openCell && (active.status === 'question' || active.status === 'revealing') ? (
          <QuestionStage
            kicker={categoryLabel(openCell.categoryId)}
            stake={`${openCell.value} points`}
            prompt={openCell.question.prompt}
            options={openCell.options}
            reveal={boardReveal}
            night={night}
            disabled={active.status !== 'question'}
            onAnswer={handleAnswer}
            petSlot={petSlot(petSizeFor(stageSize))}
            onPetStageLayout={onPetStageLayout}
            flourish={
              boardReveal?.correct ? (
                <PointsFlourish label={`+${openCell.value}`} reduceMotion={reduceMotion} />
              ) : null
            }
          />
        ) : null}

        {active.status === 'wager' ? (
          <WagerPanel
            baselineXp={active.baselineXp}
            boardXp={jeopardyBoardXp(active)}
            max={max}
            amount={amount}
            onChange={setWager}
            onConfirm={() => handleWager(amount)}
            night={night}
            busy={saving}
          />
        ) : null}

        {final && (active.status === 'final' || active.status === 'finalRevealing') ? (
          <QuestionStage
            kicker="Final Jeopardy"
            stake={`${active.wager ?? 0} XP at stake`}
            prompt={final.question.prompt}
            options={final.options}
            reveal={finalReveal}
            night={night}
            disabled={active.status !== 'final'}
            onAnswer={handleAnswer}
            petSlot={petSlot(Math.round(petSizeFor(stageSize) * FINAL_PET_SCALE))}
            onPetStageLayout={onPetStageLayout}
            emphasis
            flourish={
              finalReveal?.correct ? (
                <PointsFlourish label={`+${active.wager ?? 0} XP`} reduceMotion={reduceMotion} />
              ) : null
            }
            footer={
              finalReveal ? <PrimaryButton label="See results" onPress={handleSeeResults} /> : null
            }
          />
        ) : null}

        {active.status === 'complete' ? (
          <JeopardyResults
            pet={pet}
            game={active}
            night={night}
            saving={saving}
            error={saveError}
            onSaveAndLeave={handleClose}
            onPlayAgain={handlePlayAgain}
          />
        ) : null}

        {active.status === 'complete' ? null : (
          <View style={styles.footer}>
            <ErrorText>{saveError}</ErrorText>
          </View>
        )}
      </JeopardyFrame>
    </Modal>
  );
}

/** The same sheet presentation the other mind games use (MindGym, WordPuzzle, Four Corners). */
const SHEET = { animationType: 'slide', presentationStyle: 'pageSheet' } as const;

const styles = StyleSheet.create({
  petLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petStage: { flex: 1, alignSelf: 'stretch', backgroundColor: 'transparent', overflow: 'visible' },

  footer: { paddingHorizontal: 18, paddingBottom: 18 },
});
