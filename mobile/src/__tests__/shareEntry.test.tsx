import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { createPet } from '@vitto/core';
import { PetStatsScreen } from '../screens/PetStatsScreen';

const pet = { ...createPet('u', 'Blue', 'dog', 'bunny'), level: 23 };

describe('reaching the share card', () => {
  it('offers Share from the stats top bar, and not when there is nowhere to go', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetStatsScreen pet={pet} events={[]} onClose={() => {}} onShare={() => { opened += 1; }} />,
      );
    });
    const button = tree.root.findAll((n: any) => typeof n.props.onPress === 'function'
      && n.findAllByType(Text).some((t: any) => t.props.children === 'Share'))[0];
    expect(button).toBeTruthy();
    act(() => button!.props.onPress());
    expect(opened).toBe(1);
    act(() => tree.unmount());

    let plain!: renderer.ReactTestRenderer;
    act(() => { plain = renderer.create(<PetStatsScreen pet={pet} events={[]} onClose={() => {}} />); });
    expect(plain.root.findAll((n: any) => n.props.accessibilityLabel === 'Share Blue')).toHaveLength(0);
    act(() => plain.unmount());
  });
});
