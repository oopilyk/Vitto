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
    correct: 1,
    total: 1,
    durationSeconds: 420,
    score: 75,
    puzzleDate: todayKey,
    generatorVersion: 2,
    roundOutcomes: [{ length: 5, solved: true, guessesUsed: 4 }],
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

    expect(rendered).toContain('75');
    expect(rendered).toContain('Solved in 4');
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

    type(tree, 'zzzzz');
    act(() => byLabel(tree, 'Submit guess')!.props.onPress());

    expect(JSON.stringify(tree.toJSON())).toContain('word list');
    // Nothing was marked, so no tile carries a verdict yet.
    expect(byLabel(tree, 'Z, not in the word')).toBeUndefined();
    expect(saved).toHaveLength(1);
    tree.unmount();
  });

  it('saves each guess, then the outcome once the word is solved', () => {
    const saved: WordPuzzleProgress[] = [];
    const tree = render({ onSaveProgress: (progress) => saved.push(progress) });

    act(() => byText(tree, "Start today's puzzle")!.props.onPress());
    const answer = revealAnswer(todayKey, 0);
    expect(answer).toHaveLength(5);
    // A wrong-but-real word spends a guess and is saved, with no outcome yet.
    const miss = answer === 'audio' ? 'crane' : 'audio';
    type(tree, miss);
    act(() => byLabel(tree, 'Submit guess')!.props.onPress());
    expect(saved[saved.length - 1]).toMatchObject({ roundIndex: 0, guesses: [[miss]], outcomes: [] });
    expect(JSON.stringify(tree.toJSON())).toContain('5 of 6 guesses left');

    type(tree, answer);
    act(() => byLabel(tree, 'Submit guess')!.props.onPress());

    const latest = saved[saved.length - 1]!;
    expect(latest.roundIndex).toBe(1);
    expect(latest.outcomes).toEqual([{ length: 5, solved: true, guessesUsed: 2 }]);
    expect(latest.guesses).toEqual([[miss, answer]]);
    // Only the shape above is written down — no answer field rides along.
    expect(Object.keys(latest).sort()).toEqual([
      'guesses',
      'outcomes',
      'puzzleDate',
      'roundIndex',
      'startedAt',
    ]);

    expect(JSON.stringify(tree.toJSON())).toContain('Got it in 2.');
    act(() => byText(tree, 'See your score')!.props.onPress());
    const summary = JSON.stringify(tree.toJSON());
    expect(summary).toContain('Solved in 2');
    expect(summary).toContain('95');
    tree.unmount();
  });

  it('resumes a saved day with its guesses on the board', () => {
    const progress: WordPuzzleProgress = {
      puzzleDate: todayKey,
      startedAt: new Date().toISOString(),
      roundIndex: 0,
      guesses: [['audio', 'crane']],
      outcomes: [],
    };
    const tree = render({ progress });

    expect(JSON.stringify(tree.toJSON())).toContain('4 of 6 guesses left');
    // Straight into play — the intro is not shown again.
    expect(byText(tree, "Start today's puzzle")).toBeUndefined();
    expect(byLabel(tree, 'Submit guess')).toBeTruthy();
    tree.unmount();
  });

  it('ends the day after six misses and shows the word', () => {
    const answer = revealAnswer(todayKey, 0);
    const misses = ['audio', 'crane', 'light', 'storm', 'plumb', 'fjord'].filter((word) => word !== answer).slice(0, 5);
    const progress: WordPuzzleProgress = {
      puzzleDate: todayKey,
      startedAt: new Date().toISOString(),
      roundIndex: 0,
      guesses: [misses],
      outcomes: [],
    };
    const tree = render({ progress });
    const last = ['jumpy', 'vixen'].find((word) => word !== answer)!;
    type(tree, last);
    act(() => byLabel(tree, 'Submit guess')!.props.onPress());

    expect(JSON.stringify(tree.toJSON())).toContain(`The word was ${answer.toUpperCase()}.`);
    act(() => byText(tree, 'See your score')!.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('Not solved');
    tree.unmount();
  });
});
