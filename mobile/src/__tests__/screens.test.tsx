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
        breed="shiba"
        onBreedChange={() => {}}
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

  it("shows only five of today's care events, with a link to the rest", () => {
    const stepEvents: HealthEvent[] = Array.from({ length: 9 }, (_, index) => ({
      id: `step-${index}`,
      userId: 'user-1',
      occurredAt: new Date().toISOString(),
      type: 'STEP_ACTIVITY',
      source: 'mock',
      metadata: { steps: 6840 },
    })) as unknown as HealthEvent[];

    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={stepEvents}
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

    const { Text: RNText } = require('react-native');
    const rows = tree.root
      .findAllByType(RNText)
      .filter((node: any) => node.props.children === 'Went exploring');
    expect(rows).toHaveLength(5);

    const more = tree.root
      .findAll((node: any) => typeof node.props.onPress === 'function')
      .find((node: any) =>
        node
          .findAllByType(RNText)
          .some((label: any) => JSON.stringify(label.props.children).includes('more today')),
      );
    expect(more).toBeTruthy();
    // Nine events, five shown, so four are behind the link.
    expect(JSON.stringify(more!.findAllByType(RNText)[0].props.children)).toContain('4');
    act(() => more!.props.onPress());
    expect(opened).toBe(1);
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

describe('breed picker', () => {
  const { BreedPicker } = require('../components/BreedPicker');

  it('reports the breed that was tapped', () => {
    const chosen: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<BreedPicker value="bichon" onChange={(b: string) => chosen.push(b)} />);
    });

    const shiba = tree.root
      .findAllByProps({ accessibilityLabel: 'Choose the Shiba' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(shiba).toBeTruthy();
    expect(shiba!.props.accessibilityState).toEqual({ selected: false });

    act(() => shiba!.props.onPress());
    expect(chosen).toEqual(['shiba']);
    tree.unmount();
  });
});

describe('profile screen', () => {
  const { ProfileScreen } = require('../screens/ProfileScreen');

  const render = (onSave: (next: unknown) => Promise<void> = async () => {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          profile={profile}
          breed="shiba"
          onBreedChange={() => {}}
          events={[]}
          onSave={onSave}
          onClose={() => {}}
        />,
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

describe('pet sprite', () => {
  const { PetAvatar, animationFor } = require('../components/PetAvatar');
  const { sheetForPet, PET_SHEETS } = require('../components/petSprites');
  const { Image } = require('react-native');

  const spriteOffset = (overrides: Record<string, unknown>) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetAvatar
          pet={pet}
          isAnalyzingMeal={false}
          isEating={false}
          feedingImage={null}
          feedingGrade={null}
          isCelebrating={false}
          isWorkingOut={false}
          isExploring={false}
          {...overrides}
        />,
      );
    });
    // The sheet is the Image with a negative offset windowing one cell.
    const sheet = tree.root
      .findAllByType(Image)
      .find((node: any) => node.props.style?.marginLeft !== undefined);
    const { marginLeft, marginTop } = sheet!.props.style;
    tree.unmount();
    return { marginLeft, marginTop };
  };

  it('picks the band that matches what the pet is doing', () => {
    expect(animationFor('celebrating', 'content')).toBe('cheer');
    expect(animationFor('exploring', 'content')).toBe('move');
    expect(animationFor('idle', 'sleepy')).toBe('rest');
    expect(animationFor('idle', 'hungry')).toBe('idle');
  });

  it('windows a different cell of the sheet for resting than for running', () => {
    const resting = spriteOffset({ pet: { ...pet, mood: 'sleepy' } });
    const running = spriteOffset({ isExploring: true });
    expect(resting).not.toEqual(running);
    // Every frame is windowed from inside the sheet, never past its edge.
    expect(resting.marginTop).toBeLessThanOrEqual(0);
    expect(running.marginLeft).toBeLessThanOrEqual(0);
  });

  it('draws the breed the pet was given', () => {
    const { sheetForPet } = require('../components/petSprites');
    expect(sheetForPet({ id: 'any-id', breed: 'shiba' }).name).toBe('shiba');
    expect(sheetForPet({ id: 'any-id', breed: 'bichon' }).name).toBe('bichon');
  });

  it('falls back to a stable breed for pets adopted before the picker', () => {
    expect(sheetForPet({ id: 'pet-a' })).toBe(sheetForPet({ id: 'pet-a' }));
    const breeds = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => sheetForPet({ id }).name),
    );
    expect(breeds.size).toBe(PET_SHEETS.length);
  });

  it('flies the meal photo in rather than parking it above the pet', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetAvatar
          pet={pet}
          isAnalyzingMeal={false}
          isEating
          feedingImage="file:///tmp/plate.jpg"
          feedingGrade="A"
          isCelebrating={false}
          isWorkingOut={false}
          isExploring={false}
        />,
      );
    });

    const food = tree.root
      .findAllByType(Image)
      .find((node: any) => node.props.source?.uri === 'file:///tmp/plate.jpg');
    expect(food).toBeTruthy();

    const style = [food!.props.style].flat().find((entry: any) => entry?.transform);
    // Animated values, not a fixed offset: it travels and shrinks into the pet.
    expect(style?.transform?.length).toBeGreaterThanOrEqual(4);
    expect([food!.props.style].flat().some((entry: any) => entry?.top !== undefined)).toBe(false);
    tree.unmount();
  });

  it('throws confetti when celebrating and hearts for a good plate', () => {
    const { Confetti, HeartStream } = require('../components/PetEffects');
    const render = (overrides: Record<string, unknown>) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <PetAvatar
            pet={pet}
            isAnalyzingMeal={false}
            isEating={false}
            feedingImage={null}
            feedingGrade={null}
            isCelebrating={false}
            isWorkingOut={false}
            isExploring={false}
            {...overrides}
          />,
        );
      });
      const confetti = tree.root.findByType(Confetti).props.active;
      const hearts = tree.root.findByType(HeartStream).props.active;
      tree.unmount();
      return { confetti, hearts };
    };

    expect(render({})).toEqual({ confetti: false, hearts: false });
    // Confetti for any celebration; hearts only when the plate graded well.
    expect(render({ isCelebrating: true, feedingGrade: 'D' })).toEqual({
      confetti: true,
      hearts: false,
    });
    expect(render({ isCelebrating: true, feedingGrade: 'A' })).toEqual({
      confetti: true,
      hearts: true,
    });
  });

  it('sends the hearts up out of the top of the pet', () => {
    const { HeartStream } = require('../components/PetEffects');
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HeartStream active headOffset={80} />);
    });

    const { Text: RNText } = require('react-native');
    const hearts = tree.root.findAllByType(RNText).filter((node: any) => node.props.children === '♥');
    expect(hearts.length).toBeGreaterThan(0);

    // The layer is lifted above centre, and each heart travels upward.
    const layer = tree.root.findAll((node: any) =>
      [node.props.style].flat(2).some((entry: any) => entry?.marginTop === -80),
    );
    expect(layer.length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('only references frames that exist on the sheet', () => {
    for (const sheet of PET_SHEETS) {
      for (const frames of Object.values(sheet.animations) as [number, number][][]) {
        expect(frames.length).toBeGreaterThan(0);
        for (const [row, column] of frames) {
          expect(row).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThan(11);
          expect(column).toBeGreaterThanOrEqual(0);
          expect(column).toBeLessThan(4);
        }
      }
    }
  });
});
