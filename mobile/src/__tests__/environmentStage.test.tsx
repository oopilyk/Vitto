import { Animated, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { createPet } from '@vitto/core';
import { EnvironmentStage, type EnvironmentDressing } from '../petWorld/EnvironmentStage';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import type { EnvironmentId } from '../petWorld/types';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const pet = createPet('user-1', 'Miso');

const dressing = (name: string): EnvironmentDressing => ({
  background: <Text>{`${name} bg`}</Text>,
  backgroundColor: '#ffffff',
  controls: <Text>{`${name} controls`}</Text>,
});

const environments: Record<EnvironmentId, EnvironmentDressing> = {
  main: dressing('main'),
  kitchen: dressing('kitchen'),
  gym: dressing('gym'),
  outside: dressing('outside'),
  study: dressing('study'),
};

const render = (onPetTap?: () => void) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <EnvironmentStage
        environment="main"
        pet={pet}
        activityProps={IDLE_ACTIVITY}
        environments={environments}
        onPetTap={onPetTap}
      />,
    );
  });
  return tree;
};

const petLayer = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByProps({ accessibilityLabel: `Say hi to ${pet.name}` })
    .find((node) => typeof node.props.onPress === 'function');

describe('EnvironmentStage pet tap reaction', () => {
  it('reacts to a touch on the pet: fires onPetTap and runs the bounce without throwing', () => {
    const taps: number[] = [];
    const tree = render(() => taps.push(1));

    const layer = petLayer(tree);
    expect(layer).toBeTruthy();
    act(() => layer!.props.onPress());
    expect(taps).toHaveLength(1);

    // The pet's stage is an Animated.View carrying an interpolated transform, so
    // the poke has something to drive — a plain View here would mean no reaction.
    const animated = tree.root
      .findAllByType(Animated.View)
      .find((node) =>
        [node.props.style].flat(2).some((entry) => Array.isArray(entry?.transform)),
      );
    expect(animated).toBeTruthy();
    tree.unmount();
  });

  it('is not a button and ignores taps when no onPetTap is given', () => {
    const tree = render(undefined);
    expect(petLayer(tree)).toBeUndefined();
    tree.unmount();
  });
});
