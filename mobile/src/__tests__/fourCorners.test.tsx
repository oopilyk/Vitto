import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  type BrainTrainingMetadata,
  type FourCorner,
  type FourCornersRound,
  type TriviaQuestion,
  createFourCornersRound,
  createPet,
} from '@vitto/core';
import { FourCornersScreen } from '../screens/FourCornersScreen';
import { JUMP_MS, REVEAL_HOLD_MS, cornerLabel } from '../fourCorners/corners';

/** Flipped per test; the `mock` prefix is what lets the factory below close over it. */
let mockReduceMotion = false;
jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion,
}));

const pet = createPet('user-1', 'Miso');

const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

/** Five questions with unmistakable answers, so a corner's text identifies it. */
const POOL: readonly TriviaQuestion[] = [
  { id: 'q1', category: 'general', prompt: 'Question one?', answers: ['A1', 'A2', 'A3', 'A4'] },
  { id: 'q2', category: 'general', prompt: 'Question two?', answers: ['B1', 'B2', 'B3', 'B4'] },
  { id: 'q3', category: 'general', prompt: 'Question three?', answers: ['C1', 'C2', 'C3', 'C4'] },
  { id: 'q4', category: 'general', prompt: 'Question four?', answers: ['D1', 'D2', 'D3', 'D4'] },
  { id: 'q5', category: 'general', prompt: 'Question five?', answers: ['E1', 'E2', 'E3', 'E4'] },
];

const CORNERS: readonly FourCorner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

/** Both the composite and the host node match a label, so take the pressable one. */
const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find((node: any) => typeof node.props.onPress === 'function');

const buttonWithText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t: any) => t.props.children === label));

const press = (node: any) => {
  act(() => {
    node.props.onPress();
  });
};

/** For the buttons whose handler awaits `onFinish` before it calls `onClose`. */
const pressAsync = async (node: any) => {
  await act(async () => {
    await node.props.onPress();
  });
};

const json = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());

/** The pet sprite ticks on an interval, so tearing down is itself a state update. */
const unmount = (tree: renderer.ReactTestRenderer) => {
  act(() => {
    tree.unmount();
  });
};

/** The pet has landed and the tiles have resolved, but the next question has not come in. */
const settleOnReveal = () => {
  act(() => {
    jest.advanceTimersByTime(JUMP_MS);
  });
};

/** Past the reveal hold, so the round has auto-advanced. */
const settleToNextQuestion = () => {
  act(() => {
    jest.advanceTimersByTime(JUMP_MS + REVEAL_HOLD_MS + 1);
  });
};

const cornerNode = (tree: renderer.ReactTestRenderer, round: FourCornersRound, index: number, corner: FourCorner) =>
  byLabel(tree, cornerLabel(corner, round.cards[index]!.options[corner]));

const wrongCornerFor = (round: FourCornersRound, index: number): FourCorner =>
  CORNERS.find((corner) => corner !== round.cards[index]!.correctCorner)!;

const renderScreen = (
  round: FourCornersRound,
  overrides: Partial<{
    onFinish: (metadata: BrainTrainingMetadata) => Promise<void>;
    onClose: () => void;
  }> = {},
) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <FourCornersScreen
        pet={pet}
        round={round}
        onFinish={overrides.onFinish ?? (async () => {})}
        onClose={overrides.onClose ?? (() => {})}
      />,
    );
  });
  return tree;
};

/** Answers every remaining question correctly, landing on the results screen. */
const playThrough = (tree: renderer.ReactTestRenderer, round: FourCornersRound, from = 0) => {
  for (let index = from; index < round.cards.length; index += 1) {
    press(cornerNode(tree, round, index, round.cards[index]!.correctCorner));
    settleToNextQuestion();
  }
};

beforeEach(() => {
  mockReduceMotion = false;
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

describe('four corners round', () => {
  it('reveals feedback on the tapped corner and then auto-advances', () => {
    const round = createFourCornersRound(POOL, seededRng(7));
    const tree = renderScreen(round);

    expect(json(tree)).toContain(round.cards[0]!.question.prompt);

    press(cornerNode(tree, round, 0, round.cards[0]!.correctCorner));
    settleOnReveal();

    const revealed = json(tree);
    expect(revealed).toContain('CORRECT');
    expect(revealed).toContain('+2 MIND');
    // Still on question one until the hold is over.
    expect(revealed).toContain(round.cards[0]!.question.prompt);

    settleToNextQuestion();
    const next = json(tree);
    expect(next).toContain(round.cards[1]!.question.prompt);
    expect(next).toContain('2 / 5');
    expect(next).not.toContain('CORRECT!');

    unmount(tree);
  });

  it('records only one answer when two corners are tapped in quick succession', async () => {
    const round = createFourCornersRound(POOL, seededRng(11));
    const finished: BrainTrainingMetadata[] = [];
    const tree = renderScreen(round, { onFinish: async (metadata) => void finished.push(metadata) });

    const correct = round.cards[0]!.correctCorner;
    press(cornerNode(tree, round, 0, correct));
    // The second tap lands during the reveal: the domain returns the same round,
    // so it can neither add an answer nor re-award.
    press(cornerNode(tree, round, 0, wrongCornerFor(round, 0)));
    settleToNextQuestion();

    expect(json(tree)).toContain(round.cards[1]!.question.prompt);

    playThrough(tree, round, 1);
    await pressAsync(buttonWithText(tree, 'Save and go back'));

    expect(finished).toHaveLength(1);
    // Five answers, all correct — the stray second tap changed nothing.
    expect(finished[0]).toMatchObject({ game: 'fourCorners', correct: 5, total: 5 });

    unmount(tree);
  });

  it('shows which corner was actually correct after a wrong answer', () => {
    const round = createFourCornersRound(POOL, seededRng(23));
    const tree = renderScreen(round);

    const wrong = wrongCornerFor(round, 0);
    press(cornerNode(tree, round, 0, wrong));
    settleOnReveal();

    const revealed = json(tree);
    expect(revealed).toContain('YOUR PICK');
    expect(revealed).toContain('ANSWER');
    expect(revealed).toContain('+1 MIND');
    expect(revealed).not.toContain('CORRECT!');

    unmount(tree);
  });

  it('puts the verdict on the tile labels so a screen reader hears it', () => {
    const round = createFourCornersRound(POOL, seededRng(31));
    const tree = renderScreen(round);
    const correctCorner = round.cards[0]!.correctCorner;
    const wrongCorner = wrongCornerFor(round, 0);

    press(cornerNode(tree, round, 0, wrongCorner));
    settleOnReveal();

    // The marks live in child Text nodes, which a labelled Pressable hides from
    // a screen reader — so they have to ride on the label itself.
    expect(byLabel(tree, `${cornerLabel(correctCorner, round.cards[0]!.options[correctCorner])}, ANSWER`)).toBeTruthy();
    expect(byLabel(tree, `${cornerLabel(wrongCorner, round.cards[0]!.options[wrongCorner])}, YOUR PICK`)).toBeTruthy();

    unmount(tree);
  });

  it('ends on the results screen with the right correct count', () => {
    const round = createFourCornersRound(POOL, seededRng(31));
    const tree = renderScreen(round);

    // Four right, one wrong.
    for (let index = 0; index < round.cards.length; index += 1) {
      const corner = index === 2 ? wrongCornerFor(round, index) : round.cards[index]!.correctCorner;
      press(cornerNode(tree, round, index, corner));
      settleToNextQuestion();
    }

    const results = json(tree);
    expect(results).toContain('4 / 5 correct');
    expect(results).toContain('Mind Points');
    expect(buttonWithText(tree, 'Play again')).toBeTruthy();

    unmount(tree);
  });

  it('records the round exactly once from the results action', async () => {
    const round = createFourCornersRound(POOL, seededRng(5));
    const finished: BrainTrainingMetadata[] = [];
    const closed: number[] = [];
    const tree = renderScreen(round, {
      onFinish: async (metadata) => void finished.push(metadata),
      onClose: () => closed.push(1),
    });

    playThrough(tree, round);

    const save = buttonWithText(tree, 'Save and go back');
    await pressAsync(save);
    expect(closed).toHaveLength(1);
    // A second tap on the same button must neither bank the round twice nor
    // navigate twice -- `onClose` is `goBack()`, so a double call pops two
    // screens and drops the user a level further back than they asked for.
    await pressAsync(save);

    expect(closed).toHaveLength(1);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      game: 'fourCorners',
      correct: 5,
      total: 5,
      score: 100,
      points: 10,
      maxPoints: 10,
    });
    expect(finished[0]!.durationSeconds).toBeGreaterThanOrEqual(1);

    unmount(tree);
  });
});

describe('four corners exit', () => {
  it('banks the partial round when the user leaves after answering', async () => {
    const round = createFourCornersRound(POOL, seededRng(17));
    const finished: BrainTrainingMetadata[] = [];
    const closed: number[] = [];
    const tree = renderScreen(round, {
      onFinish: async (metadata) => void finished.push(metadata),
      onClose: () => closed.push(1),
    });

    press(cornerNode(tree, round, 0, round.cards[0]!.correctCorner));
    settleToNextQuestion();
    await pressAsync(byLabel(tree, 'Close Four Corners'));

    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ game: 'fourCorners', correct: 1, total: 1, points: 2 });
    expect(closed).toHaveLength(1);

    unmount(tree);
  });

  it('records nothing when the user leaves without answering', async () => {
    const round = createFourCornersRound(POOL, seededRng(19));
    const finished: BrainTrainingMetadata[] = [];
    const closed: number[] = [];
    const tree = renderScreen(round, {
      onFinish: async (metadata) => void finished.push(metadata),
      onClose: () => closed.push(1),
    });

    await pressAsync(byLabel(tree, 'Close Four Corners'));

    expect(finished).toHaveLength(0);
    expect(closed).toHaveLength(1);

    unmount(tree);
  });

  it('keeps the round on screen and lets the user retry when saving fails', async () => {
    const round = createFourCornersRound(POOL, seededRng(23));
    const finished: BrainTrainingMetadata[] = [];
    const closed: number[] = [];
    let failNext = true;
    const tree = renderScreen(round, {
      onFinish: async (metadata) => {
        if (failNext) {
          failNext = false;
          throw new Error('Network unavailable.');
        }
        finished.push(metadata);
      },
      onClose: () => closed.push(1),
    });
    playThrough(tree, round);

    await pressAsync(buttonWithText(tree, 'Save and go back'));

    // The failure is surfaced and the user is still on their results.
    expect(json(tree)).toContain('Network unavailable.');
    expect(finished).toHaveLength(0);
    expect(closed).toHaveLength(0);

    await pressAsync(buttonWithText(tree, 'Save and go back'));

    expect(finished).toHaveLength(1);
    expect(closed).toHaveLength(1);

    unmount(tree);
  });
});

describe('four corners under reduce motion', () => {
  it('skips the jump but keeps the reveal and the auto-advance', () => {
    mockReduceMotion = true;
    const round = createFourCornersRound(POOL, seededRng(29));
    const tree = renderScreen(round);

    press(cornerNode(tree, round, 0, round.cards[0]!.correctCorner));

    // No travel to wait out: the feedback is already there on the next tick.
    act(() => {
      jest.advanceTimersByTime(0);
    });
    const revealed = json(tree);
    expect(revealed).toContain('CORRECT');
    expect(revealed).toContain('+2 MIND');

    act(() => {
      jest.advanceTimersByTime(REVEAL_HOLD_MS + 1);
    });

    const next = json(tree);
    expect(next).toContain(round.cards[1]!.question.prompt);
    expect(next).toContain('2 / 5');

    unmount(tree);
  });
});
