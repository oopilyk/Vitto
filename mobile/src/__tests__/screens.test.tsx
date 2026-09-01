import renderer, { act } from 'react-test-renderer';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { MindGymScreen } from '../screens/MindGymScreen';
import { type BodyProfile, type HealthEvent, type MealMetadata, PROFILE_SURVEY_DEFAULTS, createPet } from '@vitto/core';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

const profile: BodyProfile = {
  age: 30,
  sex: 'other',
  heightCm: 175,
  heightUnit: 'cm',
  weightKg: 74,
  weightUnit: 'kg',
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 68,
  goalWeeks: 12,
  ...PROFILE_SURVEY_DEFAULTS,
};

const pet = createPet('user-1', 'Miso');

const mealEvent: HealthEvent<MealMetadata> = {
  id: 'meal-1',
  userId: 'user-1',
  occurredAt: new Date().toISOString(),
  type: 'MEAL',
  source: 'ai',
  metadata: {
    protein: true,
    vegetables: true,
    fruit: false,
    wholeGrains: true,
    fiber: true,
    treats: false,
    loggedVia: 'ai',
    analysis: {
      grade: 'A',
      summary: 'Balanced plate.',
      confidence: 0.9,
      foodDescription: 'Chicken, broccoli, sweet potato',
      detectedFoods: ['chicken'],
      macros: { calories: 0, proteinGrams: 38, carbsGrams: 55, fatGrams: 10 },
      nutrients: {
        protein: true,
        vegetables: true,
        fruit: false,
        wholeGrains: true,
        fiber: true,
        treats: false,
      },
    },
  },
};

describe('screens render', () => {
  it('renders the onboarding wizard', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
      <OnboardingScreen
        name="Miso"
        onNameChange={() => {}}
        profile={profile}
        onUpdate={() => {}}
        onAdopt={() => {}}
        error={null}
      />,
      );
    });
    const labels = tree.root.findAllByType(require('react-native').Text);
    expect(labels.length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('renders the dashboard with a logged meal and shows derived calories', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
      <DashboardScreen
        pet={pet}
        events={[mealEvent]}
        profile={profile}
        reaction={null}
        stepGoal={10000}
        onStepGoalChange={() => {}}
        onLogMeal={() => {}}
        onLogWorkout={() => {}}
        onSyncSteps={() => {}}
        onTrainMind={() => {}}
        onOpenProfile={() => {}}
        isAnalyzingMeal={false}
        isEating={false}
        feedingImage={null}
        feedingGrade={null}
        isCelebrating={false}
        isWorkingOut={false}
        isExploring={false}
      />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());
    // 38*4 + 55*4 + 10*9 = 462, the fallback for an analysis with no calories.
    expect(rendered).toContain('462');
    expect(rendered).toContain('Miso');
    tree.unmount();
  });

  it('opens the profile from the account button in the top bar', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          profile={profile}
          reaction={null}
          stepGoal={10000}
          onStepGoalChange={() => {}}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {
            opened += 1;
          }}
          accountInitial="k"
          isAnalyzingMeal={false}
          isEating={false}
          feedingImage={null}
          feedingGrade={null}
          isCelebrating={false}
          isWorkingOut={false}
          isExploring={false}
        />,
      );
    });

    const account = tree.root
      .findAllByProps({ accessibilityLabel: 'Open your profile' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(account).toBeTruthy();
    act(() => account!.props.onPress());
    expect(opened).toBe(1);
    // Shows the signed-in initial, uppercased.
    expect(JSON.stringify(tree.toJSON())).toContain('K');
    tree.unmount();
  });

  it('keeps every log action reachable without scrolling', () => {
    const pressed: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          profile={profile}
          reaction={null}
          stepGoal={10000}
          onStepGoalChange={() => {}}
          onLogMeal={() => pressed.push('meal')}
          onLogWorkout={() => pressed.push('workout')}
          onSyncSteps={() => pressed.push('steps')}
          onTrainMind={() => pressed.push('mind')}
          onOpenProfile={() => {}}
          isAnalyzingMeal={false}
          isEating={false}
          feedingImage={null}
          feedingGrade={null}
          isCelebrating={false}
          isWorkingOut={false}
          isExploring={false}
        />,
      );
    });

    // Each Pressable matches as both composite and host node, so key by label.
    const buttons = new Map<string, any>();
    for (const node of tree.root.findAllByProps({ accessibilityRole: 'button' })) {
      const label = node.props.accessibilityLabel;
      if (typeof label === 'string' && label.startsWith('Log ') && !buttons.has(label)) {
        buttons.set(label, node);
      }
    }
    expect([...buttons.keys()]).toEqual(['Log meal', 'Log workout', 'Log steps', 'Log mind']);

    // The bar lives outside the ScrollView, so nothing has to be scrolled to reach it.
    const { ScrollView } = require('react-native');
    const scroller = tree.root.findByType(ScrollView);
    for (const [, button] of buttons) {
      expect(scroller.findAll((node: any) => node === button)).toHaveLength(0);
      act(() => button.props.onPress());
    }
    expect(pressed).toEqual(['meal', 'workout', 'steps', 'mind']);
    tree.unmount();
  });

  it('runs a maths round in the mind gym', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<MindGymScreen onFinish={async () => {}} onClose={() => {}} />);
    });

    // Find the pressable whose own subtree renders the game's name. React elements
    // hold circular fiber references, so match on the rendered text instead.
    const { Text } = require('react-native');
    const startMaths = tree.root
      .findAll((node) => typeof node.props.onPress === 'function')
      .find((node) =>
        node.findAllByType(Text).some((label: any) => label.props.children === 'Quick maths'),
      );
    expect(startMaths).toBeTruthy();

    act(() => {
      startMaths!.props.onPress();
    });

    const round = JSON.stringify(tree.toJSON());
    expect(round).toContain('left');
    expect(round).toContain('streak');
    tree.unmount();
  });
});

describe('profile screen', () => {
  const { ProfileScreen } = require('../screens/ProfileScreen');

  const render = (onSave: (next: unknown) => Promise<void> = async () => {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen profile={profile} events={[]} onSave={onSave} onClose={() => {}} />,
      );
    });
    return tree;
  };

  const findButton = (tree: renderer.ReactTestRenderer, label: string) => {
    const { Text } = require('react-native');
    return tree.root
      .findAll((node) => typeof node.props.onPress === 'function')
      .find((node) => node.findAllByType(Text).some((t: any) => t.props.children === label));
  };

  it('hides the save bar until something changes, then saves', async () => {
    const saved: unknown[] = [];
    const tree = render(async (next: unknown) => {
      saved.push(next);
    });

    expect(findButton(tree, 'Save changes')).toBeUndefined();

    // Changing the goal should reveal the save bar.
    act(() => findButton(tree, 'Build muscle')!.props.onPress());
    expect(findButton(tree, 'Save changes')).toBeTruthy();

    await act(async () => {
      await findButton(tree, 'Save changes')!.props.onPress();
    });
    expect(saved).toHaveLength(1);
    tree.unmount();
  });

  it('discards edits back to the saved profile', () => {
    const tree = render();
    act(() => findButton(tree, 'Build muscle')!.props.onPress());
    expect(findButton(tree, 'Discard')).toBeTruthy();

    act(() => findButton(tree, 'Discard')!.props.onPress());
    expect(findButton(tree, 'Save changes')).toBeUndefined();
    tree.unmount();
  });
});
