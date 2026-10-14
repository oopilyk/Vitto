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

  it('carries the pet name in the tap bubble, not a permanent HUD card', () => {
    const tree = render(() => {});
    const named = tree.root
      .findAllByType(Text)
      .some((node) => node.props.children === pet.name);
    expect(named).toBe(true);
    tree.unmount();
  });

  it('shows the name bubble only while tap emojis are in the air', () => {
    jest.useFakeTimers();
    const { PetNameBubble } = require('../petWorld/PetNameBubble');
    const tree = render(() => {});
    const shown = () => tree.root.findByType(PetNameBubble).props.visible;
    expect(shown()).toBe(false);
    act(() => petLayer(tree)!.props.onPress());
    expect(shown()).toBe(true);
    // Once the last emoji has floated off, the name goes with it.
    act(() => { jest.advanceTimersByTime(2000); });
    expect(shown()).toBe(false);
    tree.unmount();
    jest.useRealTimers();
  });

  it('floats an emoji of how the pet feels above it only after it is tapped', () => {
    const tree = render(() => {});
    const emotes = () =>
      tree.root
        .findAllByType(Text)
        .map((node) => node.props.children)
        .filter((child) => typeof child === 'string' && /^\p{Extended_Pictographic}/u.test(child));

    expect(emotes()).toHaveLength(0);
    act(() => petLayer(tree)!.props.onPress());
    expect(emotes()).toHaveLength(1);
    // Rapid taps add more rather than restarting the one in the air.
    act(() => petLayer(tree)!.props.onPress());
    act(() => petLayer(tree)!.props.onPress());
    expect(emotes()).toHaveLength(3);
    tree.unmount();
  });
});

describe('EnvironmentStage first open', () => {
  it('shows the first room at full opacity instead of fading it in', () => {
    // Fading the first room in left the TestFlight build with a blank
    // background on first open: the native fade could start before the view
    // existed natively, and opacity stayed at 0 until a room change.
    const { StyleSheet } = require('react-native');
    const tree = render();
    const background = tree.root.findAll((node) => node.props.children === 'main bg')[0]!;
    let node: any = background;
    const opacities: number[] = [];
    while (node) {
      const opacity = StyleSheet.flatten(node.props.style)?.opacity;
      if (opacity !== undefined) opacities.push(typeof opacity === 'number' ? opacity : opacity.__getValue());
      node = node.parent;
    }
    expect(opacities.length).toBeGreaterThan(0);
    expect(opacities.every((value) => value === 1)).toBe(true);
    tree.unmount();
  });
});
