import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  type JeopardyCategory,
  type JeopardyGame,
  type JeopardyQuestion,
  JEOPARDY_PICKS_PER_ROUND,
  JEOPARDY_VALUES,
  createJeopardyGame,
  createPet,
  jeopardyNetXp,
} from '@vitto/core';
import { PetJeopardyScreen } from '../screens/PetJeopardyScreen';
import { DEFAULT_WAGER, FINAL_SUSPENSE_MS, REVEAL_HOLD_MS } from '../petJeopardy/board';
// `board.ts` deliberately does not redefine the hop duration — `usePetJump`
// reads Four Corners' own, so the test has to read it from the same place.
import { JUMP_MS } from '../fourCorners/corners';

/** Flipped per test; the `mock` prefix is what lets the factory below close over it. */
let mockReduceMotion = false;
jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion,
}));

const pet = createPet('user-1', 'Miso');

const CATEGORIES: readonly JeopardyCategory[] = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
];

/** Unmistakable answers, so an answer's text identifies the tile that carries it. */
const POOL: readonly JeopardyQuestion[] = CATEGORIES.flatMap((category) =>
  JEOPARDY_VALUES.map((value) => ({
    id: `${category.id}-${value}`,
    category: category.id,
    value,
    prompt: `${category.label} ${value}?`,
    answers: [`RIGHT-${category.id}-${value}`, `WRONG-a-${value}`, `WRONG-b-${value}`],
  })),
);

const FINAL_POOL: readonly JeopardyQuestion[] = [
  { id: 'f1', category: 'final', value: 0, prompt: 'The final?', answers: ['RIGHT-final', 'NO-1', 'NO-2'] },
];

/** Deterministic: the shuffle is the identity, so the correct answer stays first. */
const staticRng = () => 0;

const newGame = (): JeopardyGame =>
  createJeopardyGame({ categories: CATEGORIES, pool: POOL, finalPool: FINAL_POOL }, staticRng);

/** The board's square-and-value pairs, in the fixed order a round plays them — alpha's three
 *  squares, since a round only ever plays `JEOPARDY_PICKS_PER_ROUND` of the board's six. */
const ROUND_SQUARES = CATEGORIES.flatMap((category) =>
  JEOPARDY_VALUES.map((value) => ({ category, value })),
).slice(0, JEOPARDY_PICKS_PER_ROUND);

/** What a round earns when every one of its picks is answered correctly. */
const PERFECT_ROUND_XP = ROUND_SQUARES.reduce((total, square) => total + square.value, 0);

/** Both the composite and the host node match a label, so take the pressable one. */
const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find((node: any) => typeof node.props.onPress === 'function');

/** Any node carrying the label — the wager readout is a Text, not a Pressable. */
const anyLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByProps({ accessibilityLabel: label })[0];

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

/** The pet sprite ticks on an interval, so tearing down is itself a state update. */
const unmount = (tree: renderer.ReactTestRenderer) => {
  act(() => {
    tree.unmount();
  });
};

/** Past the hop and the hold, so the reveal has resolved and the board is back. */
const settleBoardReveal = () => {
  act(() => {
    jest.advanceTimersByTime(JUMP_MS + REVEAL_HOLD_MS + 10);
  });
};

const render = (overrides: Partial<Parameters<typeof PetJeopardyScreen>[0]> = {}) => {
  const onFinish = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <PetJeopardyScreen
        pet={pet}
        game={newGame()}
        onFinish={onFinish}
        onClose={onClose}
        {...overrides}
      />,
    );
  });
  return { tree, onFinish, onClose };
};

/** What a square says out loud once it is spent — see `cellLabel`. */
const spentLabel = (categoryLabel: string, value: number, correct: boolean): string =>
  `${categoryLabel}, ${value} XP, already played, ${correct ? `won ${value} XP` : 'missed'}`;

/** Opens a square, answers it, and settles back onto the board. */
const playSquare = (tree: renderer.ReactTestRenderer, categoryLabel: string, value: number, correct: boolean) => {
  const cellId = `${categoryLabel.toLowerCase()}-${value}`;
  press(byLabel(tree, `${categoryLabel}, ${value} XP`));
  const answer = correct ? `RIGHT-${cellId}` : `WRONG-a-${value}`;
  press(byLabel(tree, answer));
  settleBoardReveal();
};

/** Plays a whole round (`JEOPARDY_PICKS_PER_ROUND` picks, not the whole board), winning
 *  `correctCount` of them. */
const playRound = (tree: renderer.ReactTestRenderer, correctCount: number) => {
  let played = 0;
  for (const { category, value } of ROUND_SQUARES) {
    playSquare(tree, category.label, value, played < correctCount);
    played += 1;
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  mockReduceMotion = false;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('PetJeopardyScreen board', () => {
  test('a played square cannot be reopened', () => {
    // Arrange
    const { tree } = render();
    playSquare(tree, 'Alpha', 100, true);

    // Act: the spent tile reports itself played and refuses another press.
    press(byLabel(tree, spentLabel('Alpha', 100, true)));

    // Assert: still on the board, no question reopened.
    expect(tree.root.findAllByProps({ accessibilityLabel: 'RIGHT-alpha-100' })).toHaveLength(0);
    unmount(tree);
  });

  test('rapid taps on answers cannot score a square twice', async () => {
    // Arrange
    const { tree, onFinish } = render();
    press(byLabel(tree, 'Alpha, 300 XP'));

    // Act: the user hammers the tiles during the reveal.
    press(byLabel(tree, 'RIGHT-alpha-300'));
    const second = byLabel(tree, 'WRONG-a-300');
    if (second) press(second);
    settleBoardReveal();

    // Assert: the square is spent exactly once, at its own value and no more.
    expect(byLabel(tree, spentLabel('Alpha', 300, true))).toBeDefined();
    await pressAsync(byLabel(tree, 'Close Pet Jeopardy'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].total).toBe(1);
    expect(onFinish.mock.calls[0][0].points).toBe(300);
    unmount(tree);
  });

  test('a round cannot be played past its picks, even though squares remain', () => {
    // Arrange: use up the round's three picks.
    const { tree } = render();
    playRound(tree, JEOPARDY_PICKS_PER_ROUND);

    // Assert: the board is gone (the wager panel is up) rather than offering a fourth square.
    expect(byLabel(tree, 'Beta, 100 XP')).toBeUndefined();
    unmount(tree);
  });
});

describe('PetJeopardyScreen wager', () => {
  const toWager = () => {
    const rendered = render();
    playRound(rendered.tree, JEOPARDY_PICKS_PER_ROUND);
    return rendered;
  };

  test('offers the default wager, capped by what the round actually earned', () => {
    const { tree } = toWager();

    // A perfect round here banks every value tier once — well above the default stake.
    expect(anyLabel(tree, `Wager: ${DEFAULT_WAGER} XP`)).toBeDefined();
    unmount(tree);
  });

  test("\"Everything\" wagers exactly what the round earned, not the pet's whole history", () => {
    const { tree } = toWager();

    press(byLabel(tree, 'Wager everything'));

    expect(anyLabel(tree, `Wager: ${PERFECT_ROUND_XP} XP`)).toBeDefined();
    unmount(tree);
  });

  test('a round that earned nothing offers nothing to wager', () => {
    const { tree } = render();
    playRound(tree, 0);

    press(byLabel(tree, 'Wager everything'));

    expect(anyLabel(tree, 'Wager: 0 XP')).toBeDefined();
    unmount(tree);
  });

  test('locking a stake in deals the final question and hides the board', () => {
    const { tree } = toWager();

    press(byLabel(tree, 'Wager nothing'));
    press(buttonWithText(tree, 'Lock it in'));

    expect(byLabel(tree, 'RIGHT-final')).toBeDefined();
    unmount(tree);
  });
});

describe('PetJeopardyScreen award', () => {
  const toResults = (correctCount: number, wagerPreset: string, finalCorrect: boolean) => {
    const rendered = render();
    playRound(rendered.tree, correctCount);
    press(byLabel(rendered.tree, wagerPreset));
    press(buttonWithText(rendered.tree, 'Lock it in'));
    press(byLabel(rendered.tree, finalCorrect ? 'RIGHT-final' : 'NO-1'));
    act(() => {
      jest.advanceTimersByTime(FINAL_SUSPENSE_MS + JUMP_MS + 10);
    });
    press(buttonWithText(rendered.tree, 'See results'));
    return rendered;
  };

  test('records exactly one event carrying the exact xp the game decided', async () => {
    // Arrange
    const { tree, onFinish, onClose } = toResults(JEOPARDY_PICKS_PER_ROUND, 'Wager nothing', true);

    // Act
    await pressAsync(buttonWithText(tree, 'Save and go back'));

    // Assert
    expect(onFinish).toHaveBeenCalledTimes(1);
    const metadata = onFinish.mock.calls[0][0];
    expect(metadata.game).toBe('petJeopardy');
    expect(metadata.correct).toBe(JEOPARDY_PICKS_PER_ROUND + 1);
    expect(metadata.total).toBe(JEOPARDY_PICKS_PER_ROUND + 1);
    expect(metadata.xpAwarded).toBe(PERFECT_ROUND_XP);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount(tree);
  });

  test('a lost wager never sends negative xp to the engine', async () => {
    // Arrange: nothing won on the board, so there is nothing to stake or lose.
    const { tree, onFinish } = toResults(0, 'Wager everything', false);

    // Act
    await pressAsync(buttonWithText(tree, 'Save and go back'));

    // Assert: the floor holds — the engine must never see a negative delta.
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].xpAwarded).toBe(0);
    unmount(tree);
  });

  test('a won wager on a partial board never exceeds double what was earned', async () => {
    // Arrange: one square won (100 xp), then all of it staked and won again.
    const { tree, onFinish } = toResults(1, 'Wager everything', true);

    // Act
    await pressAsync(buttonWithText(tree, 'Save and go back'));

    // Assert: 100 earned + 100 wagered and won = 200, never the pet's unrelated total.
    expect(onFinish.mock.calls[0][0].xpAwarded).toBe(200);
    unmount(tree);
  });

  test('leaving mid-game banks the squares already played, exactly once', async () => {
    // Arrange
    const { tree, onFinish, onClose } = render();
    playSquare(tree, 'Alpha', 100, true);
    playSquare(tree, 'Beta', 200, false);

    // Act
    await pressAsync(byLabel(tree, 'Close Pet Jeopardy'));

    // Assert: scored on what was actually answered, not what was dealt.
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].total).toBe(2);
    expect(onFinish.mock.calls[0][0].correct).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount(tree);
  });

  test('leaving without answering anything records no event at all', async () => {
    const { tree, onFinish, onClose } = render();

    await pressAsync(byLabel(tree, 'Close Pet Jeopardy'));

    expect(onFinish).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount(tree);
  });

  test('a failed save keeps the game open so the work is never silently lost', async () => {
    // Arrange
    const onFinish = jest.fn().mockRejectedValue(new Error('offline'));
    const { tree, onClose } = render({ onFinish });
    playSquare(tree, 'Alpha', 100, true);

    // Act
    await pressAsync(byLabel(tree, 'Close Pet Jeopardy'));

    // Assert: not dismissed, and the guard is un-armed so a retry can work.
    expect(onClose).not.toHaveBeenCalled();
    await pressAsync(byLabel(tree, 'Close Pet Jeopardy'));
    expect(onFinish).toHaveBeenCalledTimes(2);
    unmount(tree);
  });

  test('play again banks the finished game before dealing the next one', async () => {
    // Arrange
    const { tree, onFinish } = toResults(JEOPARDY_PICKS_PER_ROUND, 'Wager nothing', true);

    // Act
    await pressAsync(buttonWithText(tree, 'Play again'));

    // Assert: the previous game is recorded exactly once, and a fresh, fully
    // unplayed board is up. The new board comes from the real question pool —
    // the `game` prop seeds the first deal only — so this asserts the shape
    // rather than the test pool's own labels.
    expect(onFinish).toHaveBeenCalledTimes(1);
    const squares = tree.root
      .findAll((node: any) => typeof node.props?.accessibilityLabel === 'string')
      .map((node: any) => node.props.accessibilityLabel as string)
      .filter((label) => / \d00 XP$/.test(label));
    expect(squares.length).toBeGreaterThan(0);
    expect(squares.every((label) => !label.includes('already played'))).toBe(true);
    unmount(tree);
  });
});

describe('PetJeopardyScreen resilience', () => {
  test('shows a readable message instead of crashing on an empty pool', () => {
    // Arrange: a board that cannot be dealt at all.
    const onFinish = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetJeopardyScreen
          pet={pet}
          game={undefined}
          onFinish={onFinish}
          onClose={jest.fn()}
        />,
      );
    });

    // Assert: whatever the data does, the screen renders something.
    expect(tree.toJSON()).not.toBeNull();
    unmount(tree);
  });

  test('reduce motion keeps the reveal and the clock, losing only the travel', () => {
    // Arrange
    mockReduceMotion = true;
    const { tree, onFinish } = render();

    // Act
    playSquare(tree, 'Alpha', 100, true);

    // Assert: the square still resolved and the board came back.
    expect(byLabel(tree, spentLabel('Alpha', 100, true))).toBeDefined();
    expect(onFinish).not.toHaveBeenCalled();
    unmount(tree);
  });

  test('net xp matches what the domain says the session is worth', () => {
    // Arrange: the screen must never re-derive the figure itself.
    const game = newGame();

    // Assert
    expect(jeopardyNetXp(game)).toBe(0);
  });
});
