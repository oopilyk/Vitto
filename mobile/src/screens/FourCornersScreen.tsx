import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import {
  FOUR_CORNERS,
  type BrainTrainingMetadata,
  type FourCorner,
  type FourCornersRound,
  type PetState,
  advanceFourCornersRound,
  answerFourCornersCard,
  createFourCornersRound,
  currentFourCornersCard,
  errorMessage,
  toFourCornersMetadata,
  triviaQuestions,
} from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { ErrorText, PrimaryButton } from '../components/ui';
import { CornerTile, type CornerTileState } from '../fourCorners/CornerTile';
import { FourCornersResults } from '../fourCorners/FourCornersResults';
import {
  FALLBACK_PLAY_SIZE,
  JUMP_MS,
  type PlaySize,
  REDUCED_JUMP_MS,
  REVEAL_HOLD_MS,
  cornerOffset,
  petSizeFor,
} from '../fourCorners/corners';
import { usePetJump } from '../fourCorners/usePetJump';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EnvironmentBackdrop } from '../petWorld/EnvironmentBackdrop';
import { retro, retroPressed } from '../petWorld/retroStyle';
import { isNightTime } from '../petWorld/timeOfDay';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { fonts, world } from '../theme';

const FOUR_CORNERS_BG_DAY = require('../../assets/environments/4-corners-day.png');
const FOUR_CORNERS_BG_NIGHT = require('../../assets/environments/4-corners-night.png');

/** The art's own top-edge sky tone -- see `EnvironmentBackdrop`. Painted behind
 *  it so the sliver `EnvironmentBackdrop` can't cover on the tallest phones
 *  reads as the sky continuing, not as a gap. */
const DAY_SKY = '#4f7ec2';
const NIGHT_SKY = '#12182f';

/** The scenic Four Corners environment, behind everything else on the screen.
 *  Shared by all three states (asking/revealing, results, and the empty-pool
 *  error) since they all render inside `styles.screen`. */
function FourCornersBackdrop({ night }: { night: boolean }) {
  return <EnvironmentBackdrop source={night ? FOUR_CORNERS_BG_NIGHT : FOUR_CORNERS_BG_DAY} />;
}

interface Props {
  pet: PetState;
  /** Records the round as a BRAIN_TRAINING event. Called at most once per round. */
  onFinish: (metadata: BrainTrainingMetadata) => Promise<void>;
  onClose: () => void;
  /** Injected by tests so the questions and the corner placement are known. */
  round?: FourCornersRound;
}

interface Deal {
  round: FourCornersRound | null;
  error: string | null;
}

/**
 * `createFourCornersRound` throws on an empty pool rather than dealing a hollow
 * round, so every entry point into a new round goes through this — a missing
 * data file becomes one readable line on screen instead of a crash inside a
 * `useState` initialiser.
 */
const dealRound = (): Deal => {
  try {
    return { round: createFourCornersRound(triviaQuestions), error: null };
  } catch (cause) {
    return { round: null, error: errorMessage(cause, 'No trivia questions are available right now.') };
  }
};

/**
 * Four Corners: five quick trivia questions, four answers pinned to the corners
 * of the board and the pet in the middle. Tap an answer, the pet hops to that
 * corner, the tiles resolve on landing and the next question comes straight in —
 * the whole round is meant to be over in well under a minute, so nothing here
 * waits on an animation before the next tap is possible.
 *
 * The round itself lives entirely in `@vitto/core`: `answerFourCornersCard` and
 * `advanceFourCornersRound` are the ONLY state transitions, and their
 * "returns the same reference unless it is my turn" contract is what makes a
 * rapid double-tap a no-op instead of a double award. This file owns the clock,
 * the animation, and the single `onFinish` call.
 */
export function FourCornersScreen({ pet, onFinish, onClose, round }: Props) {
  const [deal, setDeal] = useState<Deal>(() => (round ? { round, error: null } : dealRound()));
  const activeRound = deal.round;

  const roundRef = useRef<FourCornersRound | null>(activeRound);
  const startedAtRef = useRef(Date.now());
  const finishedAtRef = useRef<number | null>(activeRound?.status === 'complete' ? Date.now() : null);
  const submittedRef = useRef(false);
  /** `onClose` is `navigation.goBack()`; calling it twice would pop two screens. */
  const closedRef = useRef(false);

  const [landed, setLanded] = useState(activeRound?.status === 'revealing');
  const [playSize, setPlaySize] = useState<PlaySize>(FALLBACK_PLAY_SIZE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reduceMotion = useReducedMotion();
  const jump = usePetJump(reduceMotion);
  const jumpMs = reduceMotion ? REDUCED_JUMP_MS : JUMP_MS;
  // Read once on mount: the round is over long before the clock could tip over
  // into night, and a palette that flipped mid-question would be a distraction.
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
  const commitRound = useCallback((next: FourCornersRound) => {
    roundRef.current = next;
    setDeal({ round: next, error: null });
  }, []);

  const onPlayLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setPlaySize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const handleCorner = (corner: FourCorner) => {
    const current = roundRef.current;
    if (!current) return;
    const next = answerFourCornersCard(current, corner);
    // Identical by reference means the round refused the tap (it is already
    // revealing). No local `answered` boolean — the domain owns that guard.
    if (next === current) return;

    commitRound(next);
    setLanded(false);
    jump.jumpTo(cornerOffset(corner, playSize));

    clearTimers();
    // Feedback lands with the pet, not after everything has settled.
    revealTimer.current = setTimeout(() => setLanded(true), jumpMs);
    advanceTimer.current = setTimeout(() => {
      const live = roundRef.current;
      if (!live) return;
      const advanced = advanceFourCornersRound(live);
      if (advanced.status === 'complete') finishedAtRef.current = Date.now();
      setLanded(false);
      jump.returnToCentre();
      commitRound(advanced);
    }, jumpMs + REVEAL_HOLD_MS);
  };

  const buildMetadata = (source: FourCornersRound): BrainTrainingMetadata =>
    toFourCornersMetadata(source, ((finishedAtRef.current ?? Date.now()) - startedAtRef.current) / 1000);

  /**
   * The one award path. Resolves `true` when there is nothing left owing —
   * either it has just been recorded, or it already was, or nothing was
   * answered. A rejection un-arms the guard so the user can try again rather
   * than losing the round to a network blip.
   */
  const submit = async (source: FourCornersRound): Promise<boolean> => {
    if (submittedRef.current || source.answers.length === 0) return true;
    submittedRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onFinish(buildMetadata(source));
      setSaving(false);
      return true;
    } catch (cause) {
      submittedRef.current = false;
      setSaveError(errorMessage(cause, 'Could not save this round. Try again.'));
      setSaving(false);
      return false;
    }
  };

  /**
   * Leaving mid-round still banks what was earned — the metadata totals only
   * what was answered. Every exit runs through here, the hardware back button
   * and the sheet's own dismiss included, so a round can never be abandoned
   * after its reward has been shown.
   */
  const handleClose = async () => {
    if (saving || closedRef.current) return;
    clearTimers();
    const live = roundRef.current;
    if (live && !(await submit(live))) return;
    closedRef.current = true;
    onClose();
  };

  const handlePlayAgain = async () => {
    if (saving) return;
    const live = roundRef.current;
    if (live && !(await submit(live))) return;
    const next = dealRound();
    if (!next.round) {
      setSaveError(next.error);
      return;
    }
    // Only now, with the previous round safely recorded, does the new round get
    // a fresh guard and a fresh clock.
    submittedRef.current = false;
    finishedAtRef.current = null;
    startedAtRef.current = Date.now();
    setSaveError(null);
    setLanded(false);
    jump.returnToCentre();
    commitRound(next.round);
  };

  // Android's hardware back and the sheet's own dismiss both land here rather
  // than popping the route behind our back -- otherwise a finished round could
  // be shown its reward and then dropped without ever being recorded.
  const requestClose = () => void handleClose();

  if (!activeRound) {
    return (
      <Modal {...SHEET} onRequestClose={onClose}>
        <View style={[styles.screen, night && styles.screenNight, styles.centred]}>
          <FourCornersBackdrop night={night} />
          <View style={[styles.errorPanel, retro.panel, night && retro.panelNight]}>
            <Text style={[retro.label, night && retro.labelNight]}>Four Corners</Text>
            <Text style={[retro.caption, night && retro.captionNight, styles.errorLine]}>
              {deal.error ?? 'This game is unavailable right now.'}
            </Text>
            <View style={styles.errorAction}>
              <PrimaryButton label="Back to Mind" onPress={onClose} />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (activeRound.status === 'complete') {
    return (
      <Modal {...SHEET} onRequestClose={requestClose}>
      <View style={[styles.screen, night && styles.screenNight]}>
        <FourCornersBackdrop night={night} />
        <Header
          night={night}
          progress={`${activeRound.answers.length} / ${activeRound.cards.length}`}
          onClose={handleClose}
          closeDisabled={saving}
        />
        <FourCornersResults
          pet={pet}
          round={activeRound}
          metadata={buildMetadata(activeRound)}
          night={night}
          saving={saving}
          error={saveError}
          onSaveAndLeave={handleClose}
          onPlayAgain={handlePlayAgain}
        />
      </View>
      </Modal>
    );
  }

  const card = currentFourCornersCard(activeRound);
  const given = activeRound.answers[activeRound.answers.length - 1];
  // `landed` is what gates the reveal: the tiles resolve when the pet touches
  // down, not when the tap registered and not when the springs finish.
  const revealing = activeRound.status === 'revealing' && landed && Boolean(given);

  const tileState = (corner: FourCorner): CornerTileState => {
    if (!revealing || !card || !given) return 'idle';
    if (corner === card.correctCorner) return 'correct';
    if (corner === given.chosen) return 'wrong';
    return 'muted';
  };

  const tileMark = (corner: FourCorner): string | null => {
    if (!revealing || !card || !given) return null;
    if (corner === card.correctCorner) return given.correct ? 'CORRECT' : 'ANSWER';
    if (corner === given.chosen) return 'YOUR PICK';
    return null;
  };

  return (
    <Modal {...SHEET} onRequestClose={requestClose}>
    <View style={[styles.screen, night && styles.screenNight]}>
      <FourCornersBackdrop night={night} />
      <Header
        night={night}
        progress={`${Math.min(activeRound.index + 1, activeRound.cards.length)} / ${activeRound.cards.length}`}
        onClose={handleClose}
        closeDisabled={saving}
      />

      <View style={[styles.prompt, retro.panel, night && retro.panelNight]}>
        <Text style={[styles.promptText, night && styles.promptTextNight]}>{card?.question.prompt}</Text>
      </View>

      {/*
        A fixed-height slot so the board never jumps when the flash appears.
        The verdict is carried by the words and by the tile fills, not by this
        line's colour: the palette's sage reads 2.5:1 on the day surface and its
        deep coral 2.9:1 on the night one, so tinting this text would have made
        the one line that states the result the least readable thing on screen.
        The polite live region is what gets it spoken on Android, where the tile
        labels alone would not announce a change the user did not focus.
      */}
      <View style={styles.flashSlot} accessibilityLiveRegion="polite">
        {revealing && given ? (
          <View style={[styles.flashChip, retro.panelQuiet, night && retro.panelQuietNight]}>
            <Text style={[styles.flash, night && styles.flashNight]}>
              {given.correct ? `CORRECT!  +${given.points} MIND` : `NOT THAT ONE  ·  +${given.points} MIND`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.board} onLayout={onPlayLayout}>
        {FOUR_CORNERS.map((corner) => (
          <CornerTile
            key={corner}
            corner={corner}
            answer={card?.options[corner] ?? ''}
            state={tileState(corner)}
            mark={tileMark(corner)}
            night={night}
            disabled={activeRound.status !== 'asking'}
            onPress={handleCorner}
            position={SLOT_POSITION[corner]}
          />
        ))}

        <Animated.View pointerEvents="none" style={[styles.petLayer, { transform: jump.transform }]}>
          <PetAvatar
            pet={pet}
            {...IDLE_ACTIVITY}
            isCelebrating={revealing && Boolean(given?.correct)}
            hideStatusCaption
            size={petSizeFor(playSize)}
            stageStyle={styles.petStage}
          />
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <ErrorText>{saveError}</ErrorText>
      </View>
    </View>
    </Modal>
  );
}

/** The same sheet presentation the other mind games use (MindGym, WordPuzzle). */
const SHEET = { animationType: 'slide', presentationStyle: 'pageSheet' } as const;

function Header({
  night,
  progress,
  onClose,
  closeDisabled,
}: {
  night: boolean;
  progress: string;
  onClose: () => void;
  closeDisabled: boolean;
}) {
  return (
    <View style={[styles.header, { backgroundColor: night ? world.barNight : world.barDay }]}>
      <View>
        <Text style={styles.title}>Four Corners</Text>
        <Text style={styles.progress}>{progress}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Four Corners"
        accessibilityState={{ disabled: closeDisabled }}
        disabled={closeDisabled}
        onPress={onClose}
        hitSlop={10}
        style={({ pressed }) => [styles.close, pressed && retroPressed]}
      >
        <Text style={styles.closeMark}>✕</Text>
      </Pressable>
    </View>
  );
}

/** Each tile is pinned to its own corner of the measured board. */
const SLOT_POSITION: Record<FourCorner, { top?: number; bottom?: number; left?: number; right?: number }> = {
  topLeft: { top: 0, left: 0 },
  topRight: { top: 0, right: 0 },
  bottomLeft: { bottom: 0, left: 0 },
  bottomRight: { bottom: 0, right: 0 },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DAY_SKY, paddingTop: 56 },
  screenNight: { backgroundColor: NIGHT_SKY },
  centred: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  errorPanel: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 22, maxWidth: 320 },
  errorLine: { marginTop: 10, textAlign: 'center', lineHeight: 16 },
  errorAction: { marginTop: 22, alignSelf: 'stretch' },

  // Translucent, warmed strip -- the same "room visible through the bar"
  // treatment as `EnvironmentActionRow`'s bottom hotbar, just pinned to the top
  // edge instead. Always the dark scrim regardless of day/night (`barDay` and
  // `barNight` are both dark-on-art tints), so the title stays on cream text
  // rather than switching to ink, which would lose contrast over a bright day
  // sky.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: world.barHairline,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: world.nightText,
    marginBottom: 3,
  },
  progress: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, color: world.nightTextSoft },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: world.nightSurfaceSoft,
    borderWidth: 1,
    borderColor: world.barHairline,
  },
  closeMark: { fontFamily: fonts.mono, fontSize: 15, fontWeight: '700', color: world.nightText },

  prompt: { marginTop: 14, marginHorizontal: 18, paddingVertical: 14, paddingHorizontal: 16 },
  promptText: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: world.ink },
  promptTextNight: { color: world.nightText },

  flashSlot: { height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  flashChip: { paddingVertical: 4, paddingHorizontal: 12 },
  flash: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: world.ink },
  flashNight: { color: world.nightText },

  board: { flex: 1, marginTop: 6, marginHorizontal: 16, marginBottom: 8 },
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

  footer: { paddingHorizontal: 18, paddingBottom: 24 },
});
