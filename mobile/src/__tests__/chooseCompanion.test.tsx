import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { ChooseCompanionScreen } from '../screens/ChooseCompanionScreen';

const render = (coins: number, cost: number, chosen: string[] = []) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ChooseCompanionScreen breed="bichon" coins={coins} cost={cost} onChoose={(b) => chosen.push(b)} onClose={() => {}} />,
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
    expect(texts(tree)).toContain('You need 400 more coins to switch. You earn 50 for every level-up.');
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

  it('switches on the tap when switching is free', () => {
    const chosen: string[] = [];
    const tree = render(0, 0, chosen);
    act(() => tile(tree, 'fox').props.onPress());
    expect(chosen).toEqual(['fox']);
    tree.unmount();
  });
});
