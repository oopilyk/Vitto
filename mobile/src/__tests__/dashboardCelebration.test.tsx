import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { createPet } from '@vitto/core';
import { DashboardScreen } from '../screens/DashboardScreen';
import { IDLE_STATE } from '../petWorld/types';
import type { UsePetInteractionResult } from '../petWorld/usePetInteraction';
import type { CelebrationEvent } from '../celebrations/types';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const pet = createPet('user-1', 'Miso');

const idleInteraction: UsePetInteractionResult = {
  state: IDLE_STATE,
  notice: () => {},
  startAnalyzing: () => {},
  stopAnalyzing: () => {},
  startFeeding: () => {},
  startWorkout: () => {},
  startExploring: () => {},
  startTravel: () => {},
  setAmbientWalking: () => {},
  reset: () => {},
};

const render = (celebration: CelebrationEvent | null, onComplete = () => {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <DashboardScreen
        pet={pet}
        events={[]}
        reaction={null}
        onLogMeal={() => {}}
        onLogWorkout={() => {}}
        onSyncSteps={() => {}}
        onTrainMind={() => {}}
        onOpenProfile={() => {}}
        onOpenStats={() => {}}
        onOpenToday={() => {}}
        interaction={idleInteraction}
        celebration={celebration}
        onCelebrationComplete={onComplete}
      />,
    );
  });
  return tree;
};

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((node) =>
    [node.props.children]
      .flat()
      .filter((child) => typeof child === 'string' || typeof child === 'number')
      .join(''),
  );

describe('DashboardScreen level-up celebration', () => {
  it('shows nothing extra while no celebration is pending', () => {
    const tree = render(null);
    expect(strings(tree)).not.toContain('LEVEL UP!');
    tree.unmount();
  });

  it('takes over the screen when a level-up celebration is handed in', async () => {
    jest.useFakeTimers();
    const tree = render({ kind: 'levelUp', petId: pet.id, level: 6 });
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
    });
    expect(strings(tree)).toEqual(expect.arrayContaining(['LEVEL UP!', 'Miso is growing!']));
    tree.unmount();
    jest.useRealTimers();
  });
});
