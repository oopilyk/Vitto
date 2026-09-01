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
