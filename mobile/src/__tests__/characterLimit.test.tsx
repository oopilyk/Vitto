import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CharacterEditor } from '../components/CharacterEditor';

const pet = { name: 'Blue', personality: 'sweet' as const };

const render = (changesLeft?: number | null) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CharacterEditor pet={pet} age={30} onSave={() => {}} changesLeft={changesLeft} />);
  });
  return tree;
};

const saveButton = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => t.props.children === 'Save character'))[0]!;

const pickAnother = (tree: renderer.ReactTestRenderer) => {
  const option = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => t.props.children === 'Savage'))[0];
  act(() => option!.props.onPress());
};

describe('character change allowance', () => {
  it('says how many changes are left', () => {
    const tree = render(3);
    const note = tree.root.findAllByProps({ testID: 'changes-left' })[0]!;
    expect(note.props.children).toBe('3 character changes left this month.');
    tree.unmount();
  });

  it('will not save once the month is used up', () => {
    const tree = render(0);
    pickAnother(tree);
    expect(saveButton(tree).props.disabled).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'changes-left' })[0]!.props.children).toContain('reset on the 1st');
    tree.unmount();
  });

  it('shows no limit when there is none', () => {
    const tree = render(null);
    expect(tree.root.findAllByProps({ testID: 'changes-left' })).toHaveLength(0);
    pickAnother(tree);
    expect(saveButton(tree).props.disabled).toBe(false);
    tree.unmount();
  });
});
