import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { createPet, type PetForm, type PetState } from '@vitto/core';
import { EvolutionCard } from '../components/EvolutionCard';
import { SpriteFrame } from '../components/SpriteFrame';

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => [n.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''));

const pet = (over: Partial<PetState> = {}): PetState => ({
  ...createPet('u', 'Blue', 'dog', 'bear'),
  level: 6, endurance: 30, strength: 20, mind: 20,
  ...over,
});

const render = (value: PetState, onChooseForm?: (form: PetForm) => void) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<EvolutionCard pet={value} onChooseForm={onChooseForm} />);
  });
  return tree;
};

describe('EvolutionCard', () => {
  it('teases every evolution as a locked silhouette until it is earned, and says what is left', () => {
    const tree = render(pet());
    const frames = tree.root.findAllByType(SpriteFrame);
    // The base look, then the three evolutions.
    expect(frames).toHaveLength(4);
    expect(frames[0]!.props.tintColor).toBeFalsy();
    for (const frame of frames.slice(1)) expect(frame.props.tintColor).toBeTruthy();
    const all = strings(tree);
    expect(all).toContain('Runner?');
    expect(all).toContain('closest');
    expect(all.some((line) => line.startsWith('Locked'))).toBe(true);
    expect(all.some((line) => line.includes('Level 6/15') && line.includes('Endurance 30/60'))).toBe(true);
    tree.unmount();
  });

  it('wears the base look before any evolution, with nothing to switch to', () => {
    const chosen: string[] = [];
    const tree = render(pet(), (form) => chosen.push(form));
    expect(strings(tree)).toContain('Wearing');
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Wear the'))).toHaveLength(0);
    tree.unmount();
  });

  it('shows an earned form in colour', () => {
    const tree = render(pet({ level: 16, endurance: 80, evolvedBuild: 'runner', earnedBuilds: ['runner'] }));
    const frames = tree.root.findAllByType(SpriteFrame);
    // Base and runner in colour; lifter and scholar still silhouettes.
    expect(frames.filter((frame) => !frame.props.tintColor)).toHaveLength(2);
    expect(strings(tree)).toContain('Wearing');
    tree.unmount();
  });

  it('switches to any earned form, or back to base, with one earned', () => {
    const chosen: string[] = [];
    const tree = render(
      pet({ level: 16, endurance: 80, evolvedBuild: 'runner', earnedBuilds: ['runner'] }),
      (form) => chosen.push(form),
    );
    const wear = (label: string) =>
      tree.root.findAll((n) => n.props.accessibilityLabel === `Wear the ${label} form` && typeof n.props.onPress === 'function');
    act(() => wear('Base')[0]!.props.onPress());
    expect(chosen).toEqual(['base']);
    // The worn form is not a button, and locked ones are not either.
    expect(wear('Runner')).toHaveLength(0);
    expect(wear('Lifter')).toHaveLength(0);
    expect(wear('Scholar')).toHaveLength(0);
    tree.unmount();
  });

  it('marks the base as worn when the owner picked it', () => {
    const chosen: string[] = [];
    const tree = render(
      pet({ level: 16, strength: 80, evolvedBuild: 'lifter', earnedBuilds: ['runner', 'lifter'], showBase: true }),
      (form) => chosen.push(form),
    );
    const base = tree.root.findAll((n) => n.props.testID === 'form-base')[0]!;
    expect(base.findAllByType(Text).some((t) => t.props.children === 'Wearing')).toBe(true);
    const wearRunner = tree.root.findAll((n) => n.props.accessibilityLabel === 'Wear the Runner form' && typeof n.props.onPress === 'function')[0]!;
    act(() => wearRunner.props.onPress());
    expect(chosen).toEqual(['runner']);
    tree.unmount();
  });
});
