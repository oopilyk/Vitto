import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import {
  type BrainTrainingMetadata,
  findCountry,
  generateWordGarden,
  isWordGardenBloom,
} from '@vitto/core';
import { CountryGuessGame } from '../components/CountryGuessGame';
import { WordGardenGame } from '../components/WordGardenGame';
import { MindGymScreen } from '../screens/MindGymScreen';

const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

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

describe('mind gym menu', () => {
  it('offers the word garden and country games', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<MindGymScreen onFinish={async () => {}} onClose={() => {}} />);
    });
    const menu = JSON.stringify(tree.toJSON());
    expect(menu).toContain('Word garden');
    expect(menu).toContain('Guess the country');

    press(buttonWithText(tree, 'Word garden'));
    expect(byLabel(tree, 'Submit word')).toBeTruthy();
    tree.unmount();
  });
});

describe('word garden', () => {
  const puzzle = generateWordGarden(seededRng(3));
  const spell = (tree: renderer.ReactTestRenderer, word: string) => {
    for (const letter of word) {
      const label = letter === puzzle.seed ? `${letter.toUpperCase()}, seed letter` : letter.toUpperCase();
      press(byLabel(tree, label));
    }
    press(byLabel(tree, 'Submit word'));
  };

  it('grows a bloom, refuses a repeat, and hands back scored metadata', () => {
    const bloom = puzzle.words.find((word) => isWordGardenBloom(word, puzzle))!;
    const finished: BrainTrainingMetadata[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WordGardenGame puzzle={puzzle} onFinish={(metadata) => finished.push(metadata)} onCancel={() => {}} />,
      );
    });

    // "I'm done" is disabled until at least one word is in.
    expect(buttonWithText(tree, 'Grow a word first')).toBeTruthy();

    spell(tree, bloom);
    const board = JSON.stringify(tree.toJSON());
    expect(board).toContain('1 word grown');
    expect(board).toContain('Bloom!');

    // The same word again is refused rather than counted twice.
    spell(tree, bloom);
    expect(JSON.stringify(tree.toJSON())).toContain('Already grown');

    press(buttonWithText(tree, "I'm done"));
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      game: 'wordGarden',
      wordsFound: 1,
      points: bloom.length + 7,
      total: puzzle.fullBloomPoints,
      bestMultiplier: 1,
    });
    tree.unmount();
  });

  it('builds a run multiplier over consecutive finds and withers it on a miss', () => {
    const finished: BrainTrainingMetadata[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WordGardenGame puzzle={puzzle} onFinish={(metadata) => finished.push(metadata)} onCancel={() => {}} />,
      );
    });
    const [first, second, third, fourth, fifth] = puzzle.words;
    spell(tree, first!);
    spell(tree, second!);
    // Two in a row: the third word lands at x2.
    expect(JSON.stringify(tree.toJSON())).toContain('Run multiplier ×2');
    spell(tree, third!);
    // A refused entry withers the run back to x1.
    spell(tree, puzzle.seed.repeat(4));
    const withered = JSON.stringify(tree.toJSON());
    expect(withered).toContain('Run multiplier ×1');
    expect(withered).toContain('run withered');
    spell(tree, fourth!);
    spell(tree, fifth!);

    press(buttonWithText(tree, "I'm done"));
    expect(finished[0]).toMatchObject({ game: 'wordGarden', wordsFound: 5, bestMultiplier: 2 });
    tree.unmount();
  });
});

describe('guess the country', () => {
  const targets = [findCountry('France')!, findCountry('Japan')!, findCountry('Brazil')!];

  const typeAndGuess = (tree: renderer.ReactTestRenderer, name: string) => {
    const input = tree.root.findByType(TextInput);
    act(() => {
      input.props.onChangeText(name);
    });
    press(buttonWithText(tree, 'Guess'));
  };

  it('gives distance and direction on a miss, reveals on a hit, and scores the session', () => {
    const finished: BrainTrainingMetadata[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <CountryGuessGame
          session={{ targets }}
          onFinish={(metadata) => finished.push(metadata)}
          onCancel={() => {}}
        />,
      );
    });

    typeAndGuess(tree, 'Spain');
    let board = JSON.stringify(tree.toJSON());
    expect(board).toContain('Spain');
    expect(board).toContain('km');
    expect(board).toContain('↗');
    expect(board).toContain('Mystery country');

    typeAndGuess(tree, 'france');
    board = JSON.stringify(tree.toJSON());
    expect(board).toContain('Correct!');
    expect(board).toContain('Capital: Paris');

    press(buttonWithText(tree, 'Next country'));
    typeAndGuess(tree, 'Japan');
    press(buttonWithText(tree, 'Next country'));
    typeAndGuess(tree, 'Brazil');
    press(buttonWithText(tree, 'See my score'));

    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      game: 'countryGuess',
      correct: 3,
      total: 3,
      countryOutcomes: [
        { code: 'FR', solved: true, guessesUsed: 2 },
        { code: 'JP', solved: true, guessesUsed: 1 },
        { code: 'BR', solved: true, guessesUsed: 1 },
      ],
    });
    expect(finished[0]!.score).toBe(29 + 34 + 34);
    tree.unmount();
  });

  it('shows the continent after two misses and the answer once guesses run out', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <CountryGuessGame session={{ targets }} onFinish={() => {}} onCancel={() => {}} />,
      );
    });
    typeAndGuess(tree, 'Chile');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Somewhere in Europe');
    typeAndGuess(tree, 'Peru');
    expect(JSON.stringify(tree.toJSON())).toContain('Somewhere in Europe');

    // A repeat guess is refused and does not spend a turn.
    typeAndGuess(tree, 'Peru');
    expect(JSON.stringify(tree.toJSON())).toContain('already tried Peru');

    for (const name of ['Egypt', 'India', 'Kenya', 'Cuba']) typeAndGuess(tree, name);
    const board = JSON.stringify(tree.toJSON());
    expect(board).toContain('France');
    expect(board).toContain('Capital: Paris');
    expect(buttonWithText(tree, 'Next country')).toBeTruthy();
    tree.unmount();
  });
});
