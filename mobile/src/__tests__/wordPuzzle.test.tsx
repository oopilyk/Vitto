import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  type BrainTrainingMetadata,
  type HealthEvent,
  revealAnswer,
  toDateKey,
} from '@vitto/core';
import { WordPuzzleScreen } from '../screens/WordPuzzleScreen';
import { type WordPuzzleProgress } from '../services/localRepository';

const todayKey = toDateKey(new Date());

const playedToday: HealthEvent<BrainTrainingMetadata> = {
  id: 'wordPuzzle-1',
  userId: 'user-1',
  occurredAt: new Date().toISOString(),
  type: 'BRAIN_TRAINING',
  source: 'manual',
  metadata: {
    game: 'wordPuzzle',
    correct: 4,
    total: 5,
    durationSeconds: 420,
    score: 76,
    puzzleDate: todayKey,
    generatorVersion: 1,
    roundOutcomes: [
      { length: 4, solved: true, guessesUsed: 2 },
      { length: 5, solved: true, guessesUsed: 3 },
      { length: 5, solved: false, guessesUsed: 5 },
      { length: 6, solved: true, guessesUsed: 4 },
      { length: 6, solved: true, guessesUsed: 6 },
    ],
  },
};

const render = (overrides: Partial<React.ComponentProps<typeof WordPuzzleScreen>> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <WordPuzzleScreen
        events={[]}
        progress={null}
        onSaveProgress={() => {}}
        onClearProgress={() => {}}
        onFinish={async () => {}}
        onClose={() => {}}
        {...overrides}
      />,
    );
  });
  return tree;
};

/** Both the composite and the host node match a label, so take the pressable one. */
const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find((node: any) => typeof node.props.onPress === 'function');

const byText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((child: any) => child.props.children === label));

const type = (tree: renderer.ReactTestRenderer, word: string) => {
  for (const letter of word) {
    const key = tree.root
      .findAll((node: any) => typeof node.props.onPress === 'function')
      .find((node: any) =>
        String(node.props.accessibilityLabel ?? '').startsWith(`${letter.toUpperCase()}, `),
      );
    act(() => key!.props.onPress());
  }
};

describe('wordPuzzle screen', () => {
  it('closes the board when today is already logged, with no way to replay', () => {
    const tree = render({ events: [playedToday] });
    const rendered = JSON.stringify(tree.toJSON());

    expect(rendered).toContain('76');
    expect(rendered).toContain('4');
    // No keyboard and no way back into the board: one attempt a day.
    expect(byLabel(tree, 'Submit guess')).toBeUndefined();
    expect(byText(tree, "Start today's puzzle")).toBeUndefined();
    tree.unmount();
  });

  it('rejects a word it does not know without spending a guess', () => {
    const saved: WordPuzzleProgress[] = [];
    const tree = render({ onSaveProgress: (progress) => saved.push(progress) });

    act(() => byText(tree, "Start today's puzzle")!.props.onPress());
    // Starting persists the day so a mid-round exit resumes rather than restarts.
    expect(saved).toHaveLength(1);
    expect(saved[0]!.puzzleDate).toBe(todayKey);

    type(tree, 'zzzz');
    act(() => byLabel(tree, 'Submit guess')!.props.onPress());

    expect(JSON.stringify(tree.toJSON())).toContain('word list');
    // Nothing was marked, so no tile carries a verdict yet.
    expect(byLabel(tree, 'Z, not in the word')).toBeUndefined();
    expect(saved).toHaveLength(1);
    tree.unmount();
  });

  it('solves a round, saves the outcome and moves on', () => {
    const saved: WordPuzzleProgress[] = [];
    const tree = render({ onSaveProgress: (progress) => saved.push(progress) });

    act(() => byText(tree, "Start today's puzzle")!.props.onPress());
    const answer = revealAnswer(todayKey, 0);
    type(tree, answer);
    act(() => byLabel(tree, 'Submit guess')!.props.onPress());

    const latest = saved[saved.length - 1]!;
    expect(latest.roundIndex).toBe(1);
    expect(latest.outcomes).toEqual([{ length: 4, solved: true, guessesUsed: 1 }]);
    expect(latest.guesses).toEqual([[answer]]);
    // Only the shape above is written down — no answer field rides along.
    expect(Object.keys(latest).sort()).toEqual([
      'guesses',
      'outcomes',
      'puzzleDate',
      'roundIndex',
      'startedAt',
    ]);

    act(() => byText(tree, 'Next round')!.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('Round 2 of 4');
    tree.unmount();
  });

  it('resumes a saved day at the round it left off', () => {
    const progress: WordPuzzleProgress = {
      puzzleDate: todayKey,
      startedAt: new Date().toISOString(),
      roundIndex: 2,
      guesses: [['aaaa'], ['aaaaa']],
      outcomes: [
        { length: 4, solved: true, guessesUsed: 1 },
        { length: 5, solved: false, guessesUsed: 5 },
      ],
    };
    const tree = render({ progress });

    expect(JSON.stringify(tree.toJSON())).toContain('Round 3 of 4');
    // Straight into play — the intro is not shown again.
    expect(byText(tree, "Start today's puzzle")).toBeUndefined();
    expect(byLabel(tree, 'Submit guess')).toBeTruthy();
    tree.unmount();
  });
});
