import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { createPet, type PetState } from '@vitto/core';
import { EvolutionCard } from '../components/EvolutionCard';
import { SpriteFrame } from '../components/SpriteFrame';

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => [n.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''));

const pet = (over: Partial<PetState> = {}): PetState => ({
  ...createPet('u', 'Blue', 'dog', 'bear'),
  level: 6, endurance: 30, strength: 20, mind: 20,
  ...over,
});

const render = (value: PetState, onChooseForm?: (b: 'runner' | 'lifter' | 'scholar') => void) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<EvolutionCard pet={value} onChooseForm={onChooseForm} />);
  });
  return tree;
};

describe('EvolutionCard', () => {
  it('teases every form as a silhouette until it is earned, and says what is left', () => {
    const tree = render(pet());
    const frames = tree.root.findAllByType(SpriteFrame);
    expect(frames).toHaveLength(3);
    for (const frame of frames) expect(frame.props.tintColor).toBeTruthy();
    const all = strings(tree);
    expect(all).toContain('Runner?');
    expect(all).toContain('closest');
    expect(all.some((line) => line.includes('Level 6/11') && line.includes('Endurance 30/45'))).toBe(true);
    tree.unmount();
  });

  it('shows an earned form in colour', () => {
    const tree = render(pet({ level: 12, endurance: 60, evolvedBuild: 'runner', earnedBuilds: ['runner'] }));
    const frames = tree.root.findAllByType(SpriteFrame);
    expect(frames.filter((frame) => !frame.props.tintColor)).toHaveLength(1);
    expect(strings(tree)).toContain('Wearing');
    tree.unmount();
  });

  it('lets a pet with all three forms switch between them', () => {
    const chosen: string[] = [];
    const tree = render(
      pet({ level: 14, strength: 70, evolvedBuild: 'lifter', earnedBuilds: ['runner', 'lifter', 'scholar'] }),
      (build) => chosen.push(build),
    );
    expect(strings(tree).some((line) => line.includes('All three earned'))).toBe(true);
    const wearScholar = tree.root.findAll((n) => n.props.accessibilityLabel === 'Wear the Scholar form' && typeof n.props.onPress === 'function')[0]!;
    act(() => wearScholar.props.onPress());
    expect(chosen).toEqual(['scholar']);
    // The worn form is not a button.
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Wear the Lifter form')).toHaveLength(0);
    tree.unmount();
  });
});
