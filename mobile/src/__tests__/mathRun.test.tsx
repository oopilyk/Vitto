import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  type BrainTrainingMetadata,
  MATH_RUN_LIVES,
  MATH_RUN_SECONDS,
  type MathRunState,
  advanceMathRun,
  answerMathRun,
  createMathRun,
  createPet,
} from '@vitto/core';
import { MathRunGame } from '../mathRun/MathRunGame';
import {
  DASH_SPEED,
  FALLBACK_TRACK_WIDTH,
  HOP_MS,
  OBSTACLE_SIZE,
  OVER_HOLD_MS,
  RESOLVE_HOLD_MS,
  approachX,
  clearedX,
  collisionX,
  dodgePlan,
  obstacleLabel,
  petCentreX,
} from '../mathRun/track';

describe('dodge geometry', () => {
  it('draws the approach from the right edge to the collision point', () => {
    expect(approachX(0, FALLBACK_TRACK_WIDTH)).toBe(FALLBACK_TRACK_WIDTH);
    expect(approachX(1, FALLBACK_TRACK_WIDTH)).toBeCloseTo(collisionX());
    expect(approachX(2, FALLBACK_TRACK_WIDTH)).toBeCloseTo(collisionX());
    expect(approachX(-1, FALLBACK_TRACK_WIDTH)).toBe(FALLBACK_TRACK_WIDTH);
  });

  it('keeps the colliding obstacle to the right of the pet so there is always something to jump over', () => {
    expect(collisionX() + OBSTACLE_SIZE / 2).toBeGreaterThan(petCentreX());
  });

  it('lands the apex of the hop on the obstacle passing the pet', () => {
    const plan = dodgePlan(FALLBACK_TRACK_WIDTH);
    const toPet = FALLBACK_TRACK_WIDTH + OBSTACLE_SIZE / 2 - petCentreX();
    expect(plan.hopDelayMs + HOP_MS / 2).toBe(Math.round(toPet / DASH_SPEED));
    expect(plan.dashMs).toBe(Math.round((FALLBACK_TRACK_WIDTH - clearedX()) / DASH_SPEED));
    expect(plan.holdMs).toBeGreaterThanOrEqual(plan.dashMs);
    expect(plan.holdMs).toBeGreaterThanOrEqual(plan.hopDelayMs + HOP_MS);
  });

  it('slows the dash for an obstacle already on the pet so the hop can get up first', () => {
    const plan = dodgePlan(collisionX());
    expect(plan.hopDelayMs).toBe(0);
    // Off the ground for half a hop before the obstacle's centre passes.
    const toPet = collisionX() + OBSTACLE_SIZE / 2 - petCentreX();
    expect(plan.dashMs).toBeGreaterThan(Math.round(toPet / DASH_SPEED));
    expect(plan.holdMs).toBeGreaterThanOrEqual(RESOLVE_HOLD_MS);
  });
});

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

const json = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());

const buttonWithText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t: any) => t.props.children === label));

const answerInput = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByProps({ accessibilityLabel: 'Your answer' })
    .find((node: any) => typeof node.props.onChangeText === 'function');

/** Types an answer and taps Jump, the way a player would. */
const answer = (tree: renderer.ReactTestRenderer, value: number | string) => {
  act(() => {
    answerInput(tree)!.props.onChangeText(String(value));
  });
  act(() => {
    buttonWithText(tree, 'Jump')!.props.onPress();
  });
};

const advance = (ms: number) => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

/** The pet sprite ticks on an interval, so tearing down is itself a state update. */
const unmount = (tree: renderer.ReactTestRenderer) => {
  act(() => {
    tree.unmount();
  });
};

interface Rendered {
  tree: renderer.ReactTestRenderer;
  finished: { metadata: BrainTrainingMetadata; summary: string[] }[];
}

const renderGame = (run: MathRunState, rng = seededRng(7)): Rendered => {
  const finished: Rendered['finished'] = [];
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MathRunGame
        pet={pet}
        run={run}
        rng={rng}
        onFinish={(metadata, summary) => {
          finished.push({ metadata, summary });
        }}
      />,
    );
  });
  return { tree, finished };
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

describe('Quick maths run', () => {
  it('shows the first obstacle, its sum and the countdown', () => {
    const run = createMathRun(seededRng(1));
    const { tree } = renderGame(run);
    const screen = json(tree);
    expect(screen).toContain(run.obstacle.problem.prompt);
    expect(screen).toContain('left');
    expect(screen).toContain('streak');
    expect(screen).toContain('dodged');
    expect(screen).toContain(obstacleLabel(run.obstacle.kind, Math.ceil(run.obstacle.windowMs / 1000)));
    unmount(tree);
  });

  it('jumps the obstacle on the right answer and rolls the next one in', () => {
    const run = createMathRun(seededRng(2));
    const { tree, finished } = renderGame(run, seededRng(7));
    answer(tree, run.obstacle.problem.answer);

    let screen = json(tree);
    expect(screen).toContain('DODGED!');
    expect(screen).toContain('"1"');
    // Mid-jump, a second submit is ignored rather than counted twice.
    answer(tree, 0);
    expect(json(tree)).toContain('DODGED!');

    // The same rng the component was handed deals the same next obstacle.
    const expected = advanceMathRun(answerMathRun(run, run.obstacle.problem.answer), seededRng(7));
    advance(RESOLVE_HOLD_MS + 1);
    screen = json(tree);
    expect(screen).not.toContain('DODGED!');
    expect(screen).toContain(expected.obstacle.problem.prompt);
    expect(finished).toHaveLength(0);
    unmount(tree);
  });

  it('takes a hit on a wrong answer and shows the sum it missed', () => {
    const run = createMathRun(seededRng(3));
    const { tree } = renderGame(run);
    answer(tree, run.obstacle.problem.answer + 1);
    const screen = json(tree);
    expect(screen).toContain('HIT');
    expect(screen).toContain('not that');
    expect(screen).toContain(`= ${run.obstacle.problem.answer}`);
    expect(screen).toContain(`${MATH_RUN_LIVES - 1} of ${MATH_RUN_LIVES} lives left`);
    unmount(tree);
  });

  it('collides when the obstacle arrives unanswered', () => {
    const run = createMathRun(seededRng(4));
    const { tree } = renderGame(run);
    advance(run.obstacle.windowMs - 1);
    expect(json(tree)).not.toContain('HIT');
    advance(200);
    const screen = json(tree);
    expect(screen).toContain('HIT');
    expect(screen).toContain('too slow');
    unmount(tree);
  });

  it('ends the run on the third hit and reports it exactly once', () => {
    const run = createMathRun(seededRng(5));
    const { tree, finished } = renderGame(run);
    for (let hit = 1; hit <= MATH_RUN_LIVES; hit += 1) {
      answer(tree, -1);
      if (hit < MATH_RUN_LIVES) advance(RESOLVE_HOLD_MS + 1);
    }
    expect(finished).toHaveLength(0);
    advance(OVER_HOLD_MS + 1);
    expect(finished).toHaveLength(1);
    expect(finished[0]!.metadata).toMatchObject({ game: 'math', correct: 0, total: MATH_RUN_LIVES, bestStreak: 0 });
    expect(finished[0]!.summary[0]).toContain('Three hits');

    // The clock running out afterwards must not report the run a second time.
    advance(MATH_RUN_SECONDS * 1000);
    expect(finished).toHaveLength(1);
    unmount(tree);
  });

  it('ends on the clock when every obstacle is dodged', () => {
    const run = createMathRun(seededRng(6));
    const { tree, finished } = renderGame(run, seededRng(7));
    // A mirror of the run, dealt by an identical rng, so each answer is known
    // without reading component state.
    let mirror = run;
    const mirrorRng = seededRng(7);
    for (let cycle = 0; cycle < 60 && finished.length === 0; cycle += 1) {
      answer(tree, mirror.obstacle.problem.answer);
      mirror = advanceMathRun(answerMathRun(mirror, mirror.obstacle.problem.answer), mirrorRng);
      advance(RESOLVE_HOLD_MS + 1);
      // Thinking time, well inside every window.
      advance(1000);
    }
    expect(finished).toHaveLength(1);
    expect(mirror.hits).toBe(0);
    expect(mirror.dodged).toBeGreaterThan(10);
    expect(finished[0]!.metadata).toMatchObject({
      game: 'math',
      correct: mirror.dodged,
      total: mirror.faced,
      bestStreak: mirror.dodged,
      durationSeconds: MATH_RUN_SECONDS,
    });
    expect(finished[0]!.summary[0]).toContain('full');
    unmount(tree);
  });

  it('can be ended early and still hands back a result once', () => {
    const run = createMathRun(seededRng(8));
    const { tree, finished } = renderGame(run);
    act(() => {
      buttonWithText(tree, 'End run early')!.props.onPress();
    });
    expect(finished).toHaveLength(1);
    expect(finished[0]!.metadata).toMatchObject({ game: 'math', correct: 0, total: 0 });
    advance(MATH_RUN_SECONDS * 1000);
    expect(finished).toHaveLength(1);
    unmount(tree);
  });

  it('keeps the countdown and the verdicts under Reduce Motion', () => {
    mockReduceMotion = true;
    const run = createMathRun(seededRng(9));
    const { tree } = renderGame(run);
    expect(json(tree)).toContain('to dodge');
    answer(tree, run.obstacle.problem.answer);
    expect(json(tree)).toContain('DODGED!');
    unmount(tree);
  });
});
