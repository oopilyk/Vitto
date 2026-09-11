import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { createPet, type HealthEvent } from '@vitto/core';
import { detectNewStreakDay } from '../celebrations/detectNewStreakDay';
import { StreakCelebration } from '../celebrations/StreakCelebration';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const pet = createPet('user-1', 'Orion');

const meal = (occurredAt: string): HealthEvent => ({
  id: occurredAt,
  userId: 'user-1',
  occurredAt,
  type: 'MEAL',
  source: 'manual',
  metadata: { protein: true, vegetables: true, fruit: false, wholeGrains: false, fiber: false, treats: false },
});

const sleep = (occurredAt: string): HealthEvent => ({
  id: occurredAt,
  userId: 'user-1',
  occurredAt,
  type: 'SLEEP',
  source: 'healthkit',
  metadata: { asleepMinutes: 420, night: occurredAt.slice(0, 10) },
});

describe('detectNewStreakDay', () => {
  it('celebrates the first qualifying activity of a new day, with the fresh streak count', () => {
    const result = detectNewStreakDay([], meal('2026-09-10T08:00:00'), pet.id);
    expect(result).toEqual({ kind: 'streak', petId: pet.id, streak: 1 });
  });

  it('does not celebrate a second qualifying activity on a day that already qualified', () => {
    const existing = [meal('2026-09-10T08:00:00')];
    expect(detectNewStreakDay(existing, meal('2026-09-10T18:00:00'), pet.id)).toBeNull();
  });

  it('does not celebrate a non-qualifying event, such as a passively-synced sleep log', () => {
    expect(detectNewStreakDay([], sleep('2026-09-10T23:00:00'), pet.id)).toBeNull();
  });

  it('reports the real running streak, not always 1', () => {
    const existing = [meal('2026-09-08T08:00:00'), meal('2026-09-09T08:00:00')];
    const result = detectNewStreakDay(existing, meal('2026-09-10T08:00:00'), pet.id);
    expect(result).toEqual({ kind: 'streak', petId: pet.id, streak: 3 });
  });
});

describe('StreakCelebration', () => {
  const texts = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAllByType(Text).map((node) =>
      [node.props.children]
        .flat()
        .filter((child) => typeof child === 'string' || typeof child === 'number')
        .join(''),
    );

  it('announces the streak and only lets the user continue after the sequence', async () => {
    jest.useFakeTimers();
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<StreakCelebration pet={pet} streak={4} onComplete={done} />);
    });

    // The reduce-motion probe resolves on a microtask; flush it, then the timeline.
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
    });

    expect(texts(tree)).toEqual(
      expect.arrayContaining(['ORION', 'DAY STREAK!', 'Orion is proud!', '4']),
    );

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
      tree = renderer.create(<StreakCelebration pet={pet} streak={1} onComplete={done} />);
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

  it.each([
    ['day', false],
    ['night', true],
  ])('completes its full sequence and shows the streak in %s mode', async (_label, night) => {
    jest.useFakeTimers();
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<StreakCelebration pet={pet} streak={7} night={night} onComplete={done} />);
    });
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
    });

    expect(texts(tree)).toEqual(expect.arrayContaining(['DAY STREAK!', '7']));
    const continueBtn = tree.root.findAllByProps({ accessibilityLabel: 'Continue' })[0];
    expect(continueBtn.props.accessibilityState).toEqual({ disabled: false });

    tree.unmount();
    jest.useRealTimers();
  });
});
