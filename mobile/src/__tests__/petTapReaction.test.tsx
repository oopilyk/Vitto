import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { PetTapReaction, feelingEmoji } from '../petWorld/PetTapReaction';

describe('feelingEmoji', () => {
  it('smiles when happy and matches the mood otherwise', () => {
    expect(feelingEmoji('bright', null)).toBe('😄');
    expect(feelingEmoji('content', null)).toBe('😊');
    expect(feelingEmoji('sleepy', null)).toBe('😪');
    expect(feelingEmoji('hungry', null)).toBe('🤤');
  });

  it('lets what is wrong outrank the mood', () => {
    expect(feelingEmoji('bright', 'sad')).toBe('😢');
    expect(feelingEmoji('content', 'dying')).toBe('🤒');
  });
});

describe('PetTapReaction', () => {
  const emojis = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).length;

  it('plays for a tap made while it is on screen', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PetTapReaction burst={0} mood="content" ailment={null} />);
    });
    expect(emojis(tree)).toBe(0);
    act(() => tree.update(<PetTapReaction burst={1} mood="content" ailment={null} />));
    expect(emojis(tree)).toBe(1);
    tree.unmount();
  });

  it('does not replay old taps when the room is rebuilt (a room change, a logger opening)', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PetTapReaction burst={3} mood="content" ailment={null} />);
    });
    expect(emojis(tree)).toBe(0);
    tree.unmount();
  });
});
