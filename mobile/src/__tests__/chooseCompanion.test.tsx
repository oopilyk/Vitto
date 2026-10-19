import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { PetBreed } from '@vitto/core';
import { ChooseCompanionScreen } from '../screens/ChooseCompanionScreen';

const render = (coins: number, cost: number, chosen: string[] = [], owned?: PetBreed[]) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ChooseCompanionScreen breed="bichon" owned={owned} coins={coins} cost={cost} onChoose={(b) => chosen.push(b)} onClose={() => {}} />,
    );
  });
  return tree;
};
const tile = (tree: renderer.ReactTestRenderer, breed: string) =>
  tree.root.findAll((n) => n.props.testID === `breed-${breed}` && typeof n.props.onPress === 'function')[0]!;
const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
const button = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => t.props.children === label))[0];

describe('ChooseCompanionScreen', () => {
  it('greys out every other animal, and picks nothing, without enough coins', () => {
    const chosen: string[] = [];
    const tree = render(100, 500, chosen);
    expect(tile(tree, 'shiba').props.disabled).toBe(true);
    expect(tile(tree, 'bichon').props.disabled).toBe(false);
    expect(texts(tree)).toContain('You need 400 more coins for a new animal. You earn 50 for every level-up.');
    expect(tree.root.findAll((n) => n.props.testID === 'breed-switch-confirm')).toHaveLength(0);
    expect(chosen).toEqual([]);
    tree.unmount();
  });

  it('asks before spending when it can afford a switch', () => {
    const chosen: string[] = [];
    const tree = render(620, 500, chosen);
    expect(tile(tree, 'shiba').props.disabled).toBe(false);
    act(() => tile(tree, 'shiba').props.onPress());
    expect(chosen).toEqual([]);
    expect(texts(tree).some((t) => t.includes("You'll have 120 left"))).toBe(true);
    act(() => button(tree, 'Switch · 500 coins')!.props.onPress());
    expect(chosen).toEqual(['shiba']);
    tree.unmount();
  });

  it('switches back to an owned animal free, on the tap, even without coins', () => {
    const chosen: string[] = [];
    const tree = render(0, 500, chosen, ['bichon', 'shiba']);
    expect(tile(tree, 'shiba').props.disabled).toBe(false);
    // Not owned and not affordable: still greyed out, with its price.
    expect(tile(tree, 'fox').props.disabled).toBe(true);
    const all = texts(tree);
    expect(all).toContain('Current');
    expect(all).toContain('Owned · free');
    expect(all).toContain('500 coins');
    act(() => tile(tree, 'shiba').props.onPress());
    expect(chosen).toEqual(['shiba']);
    expect(tree.root.findAll((n) => n.props.testID === 'breed-switch-confirm')).toHaveLength(0);
    tree.unmount();
  });

  it('prices only the animals not owned', () => {
    const tree = render(620, 500, [], ['bichon', 'shiba']);
    const notes = texts(tree);
    expect(notes.filter((t) => t === 'Owned · free')).toHaveLength(1);
    expect(notes.filter((t) => t === '500 coins').length).toBeGreaterThan(1);
    tree.unmount();
  });

  it('switches on the tap when switching is free', () => {
    const chosen: string[] = [];
    const tree = render(0, 0, chosen);
    act(() => tile(tree, 'fox').props.onPress());
    expect(chosen).toEqual(['fox']);
    tree.unmount();
  });
});
