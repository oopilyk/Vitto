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

describe('fine-tuning drops down under the chosen base', () => {
  it('opens under the selected option and moves with the selection', () => {
    const tree = render(null);
    expect(tree.root.findAllByProps({ testID: 'choice-expanded-sweet' }).length).toBeGreaterThan(0);
    const yourOwn = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => t.props.children === 'Your own'))[0]!;
    act(() => yourOwn.props.onPress());
    expect(tree.root.findAllByProps({ testID: 'choice-expanded-sweet' })).toHaveLength(0);
    const dropdown = tree.root.findAllByProps({ testID: 'choice-expanded-custom' })[0]!;
    expect(dropdown.findAll((n) => n.props.children === 'Who are they?').length).toBeGreaterThan(0);
    tree.unmount();
  });
});

describe('the character editor keeps notes and explains the choice', () => {
  const press = (tree: renderer.ReactTestRenderer, label: string) =>
    act(() => tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => t.props.children === label))[0]!.props.onPress());

  it('keeps what was written under "Your own" when another base is tried', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CharacterEditor pet={{ name: 'Miso', personality: 'custom', persona: 'A grumpy pirate' }} age={30} onSave={() => {}} />);
    });
    press(tree, 'Sweet');
    press(tree, 'Your own');
    const input = tree.root.findAll((n) => n.props.accessibilityLabel === 'Their character' && typeof n.props.onChangeText === 'function')[0]!;
    expect(input.props.value).toBe('A grumpy pirate');
    tree.unmount();
  });

  it('describes the chosen personality with a sample line, and makes a confirmed save obvious', async () => {
    const saved: unknown[] = [];
    const onSave = async (next: unknown) => {
      saved.push(next);
      return null;
    };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CharacterEditor pet={{ name: 'Miso', personality: 'sweet' }} age={30} onSave={onSave} />);
    });
    press(tree, 'Savage');
    const preview = tree.root.findAll((n) => n.props.testID === 'personality-preview')[0]!;
    const words = preview.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(words.some((w) => w.includes('Deadpan'))).toBe(true);
    expect(words.some((w) => w.includes('Groundbreaking'))).toBe(true);
    await act(async () => {
      tree.root.findAll((n) => n.props.testID === 'save-character' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(saved).toHaveLength(1);
    // The app hands back the saved pet; once it matches, the save shows as done.
    act(() => tree.update(<CharacterEditor pet={{ name: 'Miso', personality: 'savage', dials: (saved[0] as { dials: never }).dials }} age={30} onSave={onSave} />));
    expect(tree.root.findAll((n) => n.props.testID === 'character-saved').length).toBeGreaterThan(0);
    const current = tree.root.findAll((n) => n.props.testID === 'current-character')[0]!;
    expect(current.findAllByType(Text).some((t) => t.props.children === 'Miso is Savage')).toBe(true);
    expect(current.findAllByType(Text).some((t) => t.props.children === '✓ Live now')).toBe(true);
    tree.unmount();
  });

  it('says plainly when a save did not take', async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CharacterEditor pet={{ name: 'Miso', personality: 'sweet' }} age={30} onSave={async () => 'Out of changes this month.'} />);
    });
    press(tree, 'Savage');
    await act(async () => {
      tree.root.findAll((n) => n.props.testID === 'save-character' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(tree.root.findAll((n) => n.props.testID === 'character-save-failed').length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.testID === 'character-saved')).toHaveLength(0);
    tree.unmount();
  });
});
