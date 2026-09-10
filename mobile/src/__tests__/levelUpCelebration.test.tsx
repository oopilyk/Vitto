import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { createPet } from '@vitto/core';
import { detectLevelUp } from '../celebrations/detectLevelUp';
import { LevelUpCelebration } from '../celebrations/LevelUpCelebration';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const pet = createPet('user-1', 'Miso');

describe('detectLevelUp', () => {
  it('fires only on the upward transition, never on a held or dropped level', () => {
    expect(detectLevelUp({ ...pet, level: 4 }, { level: 4 })).toBeNull();
    expect(detectLevelUp({ ...pet, level: 5 }, { level: 4 })).toBeNull();
    expect(detectLevelUp({ ...pet, level: 4 }, { level: 5 })).toEqual({
      kind: 'levelUp',
      petId: pet.id,
      level: 5,
    });
  });

  it('reports the final level reached on a multi-level jump', () => {
    expect(detectLevelUp({ ...pet, level: 2 }, { level: 5 })?.level).toBe(5);
  });
});

describe('LevelUpCelebration', () => {
  const texts = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAllByType(Text).map((node) =>
      [node.props.children]
        .flat()
        .filter((child) => typeof child === 'string' || typeof child === 'number')
        .join(''),
    );

  it('announces the level and only lets the user continue after the sequence', async () => {
    jest.useFakeTimers();
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<LevelUpCelebration pet={pet} level={5} onComplete={done} />);
    });

    // The reduce-motion probe resolves on a microtask; flush it, then the timeline.
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
    });

    expect(texts(tree)).toEqual(expect.arrayContaining(['LEVEL UP!', 'Miso is growing!', '5']));

    const continueBtn = tree.root
      .findAllByProps({ accessibilityLabel: 'Continue' })
      .find((node) => typeof node.props.onPress === 'function');
    expect(continueBtn).toBeTruthy();
    expect(continueBtn!.props.accessibilityState).toEqual({ disabled: false });

    await act(async () => {
      continueBtn!.props.onPress();
      jest.advanceTimersByTime(600);
    });
    expect(done).toHaveBeenCalledTimes(1);

    tree.unmount();
    jest.useRealTimers();
  });

  it('cannot be dismissed before the celebration has played', async () => {
    jest.useFakeTimers();
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<LevelUpCelebration pet={pet} level={3} onComplete={done} />);
    });
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(200);
    });

    const continueBtn = tree.root.findAllByProps({ accessibilityLabel: 'Continue' })[0];
    await act(async () => {
      continueBtn.props.onPress?.();
    });
    expect(done).not.toHaveBeenCalled();

    tree.unmount();
    jest.useRealTimers();
  });
});
