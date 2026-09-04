import renderer, { act } from 'react-test-renderer';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { MindGymScreen } from '../screens/MindGymScreen';
import {
  type BodyProfile,
  DECAY_PERIOD_MS,
  DECAY_PER_DAY,
  type HealthEvent,
  type MealMetadata,
  PROFILE_SURVEY_DEFAULTS,
  applyTimeDecay,
  assessCondition,
  createPet,
} from '@vitto/core';

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
        petFocusToken={0}
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
        onOpenStats={() => {}}
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
          petFocusToken={0}
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
          onOpenStats={() => {}}
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
          petFocusToken={0}
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
          onOpenStats={() => {}}
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

  it('opens the stat sheet from the vitals HUD on the pet', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          petFocusToken={0}
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
          onOpenProfile={() => {}}
          onOpenStats={() => {
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

    const hud = tree.root
      .findAllByProps({ accessibilityLabel: 'Open pet stats' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(hud).toBeTruthy();
    act(() => hud!.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('keeps every log action reachable without scrolling', () => {
    const pressed: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          petFocusToken={0}
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
          onOpenStats={() => {}}
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

describe('pet stats screen', () => {
  const { PetStatsScreen } = require('../screens/PetStatsScreen');
  const { StatBar } = require('../components/StatBar');

  const render = (overrides: Record<string, unknown> = {}, onClose: () => void = () => {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetStatsScreen
          pet={{ ...pet, lastEventAt: new Date().toISOString(), ...overrides }}
          events={[mealEvent]}
          onClose={onClose}
        />,
      );
    });
    return tree;
  };

  const bars = (tree: renderer.ReactTestRenderer) =>
    new Map<string, number>(
      tree.root.findAllByType(StatBar).map((node: any) => [node.props.label, node.props.value]),
    );

  it('surfaces the stats the dashboard never shows', () => {
    const tree = render({
      energy: 57,
      nutrition: 43,
      happiness: 91,
      strength: 33,
      recovery: 27,
    });

    const shown = bars(tree);
    // None of these five appear anywhere else in the app.
    expect(shown.get('Energy')).toBe(57);
    expect(shown.get('Nutrition')).toBe(43);
    expect(shown.get('Happiness')).toBe(91);
    expect(shown.get('Strength')).toBe(33);
    expect(shown.get('Recovery')).toBe(27);

    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Miso');
    expect(rendered).toContain('Condition');
    expect(rendered).toContain('Body');
    tree.unmount();
  });

  it('draws the projection it was handed, without decaying it a second time', () => {
    // Offsets are counted in decay PERIODS and losses in DECAY_PER_DAY, so this
    // holds whether a "day" is a minute of test time or an actual day. Hard-coding
    // either mode would make the test fail the moment the constant is flipped.
    const at = Date.now();
    const source = {
      ...pet,
      lastEventAt: new Date(at - 2 * DECAY_PERIOD_MS).toISOString(),
      energy: 80,
      nutrition: 60,
    };
    // App does this once and passes the result down; the screen must not repeat it.
    const projected = applyTimeDecay(source, new Date(at));
    const tree = render({ ...projected });

    const shown = bars(tree);
    expect(shown.get('Energy')).toBe(80 - 2 * DECAY_PER_DAY.energy);
    expect(shown.get('Nutrition')).toBe(60 - 2 * DECAY_PER_DAY.nutrition);
    // Exactly what it was given: a second pass would subtract the same window again.
    expect(shown.get('Energy')).toBe(projected.energy);
    expect(shown.get('Nutrition')).toBe(projected.nutrition);
    // Projecting is non-destructive — the caller's stored pet is untouched.
    expect(source.energy).toBe(80);
    expect(source.nutrition).toBe(60);
    tree.unmount();
  });

  it('warns loudly while the compressed test clock is in force', () => {
    const { IS_TEST_DECAY_PERIOD } = require('@vitto/core');
    const tree = render();
    const rendered = JSON.stringify(tree.toJSON());
    // The banner is the guard against shipping the test constant, so it has to be
    // present exactly while the constant is wrong — and gone once it is fixed.
    expect(rendered.includes('TEST MODE')).toBe(IS_TEST_DECAY_PERIOD);
    tree.unmount();
  });

  it('caps a legacy stat that was stored above the bar maximum', () => {
    const tree = render({ strength: 140, endurance: 260 });
    const shown = bars(tree);
    expect(shown.get('Strength')).toBe(100);
    expect(shown.get('Endurance')).toBe(100);
    tree.unmount();
  });

  it('goes back to the pet from the top bar', () => {
    let closed = 0;
    const tree = render({}, () => {
      closed += 1;
    });

    const back = tree.root
      .findAllByProps({ accessibilityLabel: 'Back to your pet' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(back).toBeTruthy();
    act(() => back!.props.onPress());
    expect(closed).toBe(1);
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

  const well = assessCondition(pet);

  it('picks the band that matches what the pet is doing', () => {
    expect(animationFor('celebrating', 'content', well)).toBe('cheer');
    expect(animationFor('exploring', 'content', well)).toBe('move');
    expect(animationFor('idle', 'sleepy', well)).toBe('rest');
    expect(animationFor('idle', 'hungry', well)).toBe('idle');
  });

  it('lets what the pet is doing outrank what is wrong with it', () => {
    const starving = assessCondition({ ...pet, nutrition: 4 });
    expect(starving.primary).toBe('starving');
    // Feeding a starving dog has to show it eating, or the meal reads as wasted.
    expect(animationFor('eating', 'hungry', starving)).toBe('cheer');
    expect(animationFor('workout', 'hungry', starving)).toBe('move');
    // Idle, the ailment takes the sprite back over.
    expect(animationFor('idle', 'hungry', starving)).toBe('sad');
  });

  it('gives each ailment its own body pose, worst first', () => {
    const poseFor = (overrides: Record<string, number>) =>
      animationFor('idle', 'content', assessCondition({ ...pet, ...overrides }));

    expect(poseFor({ health: 5 })).toBe('faint');
    expect(poseFor({ energy: 8 })).toBe('rest');
    expect(poseFor({ happiness: 12 })).toBe('sad');
    expect(poseFor({ mind: 3 })).toBe('unwell');
    // Dying outranks everything else that is also true at the time.
    expect(poseFor({ health: 5, energy: 8, happiness: 12, mind: 3 })).toBe('faint');
    // And an ailment outranks the mood fallback rather than the other way round.
    expect(animationFor('idle', 'sleepy', assessCondition({ ...pet, mind: 3 }))).toBe('unwell');
  });

  it('shows the overlays the condition names, and none at all while dying', () => {
    const { DizzyOrbit, Fading, HungerPangs, RainCloud, Zzz } = require('../components/PetEffects');
    const overlayState = (overrides: Record<string, number>) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <PetAvatar
            pet={{ ...pet, ...overrides }}
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
      const state = {
        hunger: tree.root.findByType(HungerPangs).props.active,
        zzz: tree.root.findByType(Zzz).props.active,
        rain: tree.root.findByType(RainCloud).props.active,
        dizzy: tree.root.findByType(DizzyOrbit).props.active,
        fading: tree.root.findAllByType(Fading).length > 0,
      };
      tree.unmount();
      return state;
    };

    // Worst ailment takes the sprite AND keeps its own overlay, so an exhausted,
    // sad pet shows both sets of particles rather than only the lesser one's.
    expect(overlayState({ energy: 8, happiness: 12 })).toEqual({
      hunger: false,
      zzz: true,
      rain: true,
      dizzy: false,
      fading: false,
    });
    // A single ailment still gets its own particles -- the case they describe best.
    expect(overlayState({ nutrition: 4 })).toEqual({
      hunger: true,
      zzz: false,
      rain: false,
      dizzy: false,
      fading: false,
    });
    // Dying suppresses every overlay and washes the pet out instead.
    expect(overlayState({ health: 5, nutrition: 4, energy: 8, happiness: 12, mind: 3 })).toEqual({
      hunger: false,
      zzz: false,
      rain: false,
      dizzy: false,
      fading: true,
    });
    expect(overlayState({})).toEqual({
      hunger: false,
      zzz: false,
      rain: false,
      dizzy: false,
      fading: false,
    });
  });

  it('keeps a fainted pet down instead of standing it back up', () => {
    const { HOLDS_LAST_FRAME } = require('../components/petSprites');
    // The frame timer holds on the last cell for these; everything else loops.
    expect(HOLDS_LAST_FRAME.has('faint')).toBe(true);
    expect(HOLDS_LAST_FRAME.has('idle')).toBe(false);
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

    // `headOffset` is the top of the pet's head, so the layer must sit strictly
    // past it — an effect level with the anchor would still touch the sprite.
    const layer = tree.root.findAll((node: any) =>
      [node.props.style].flat(2).some((entry: any) => typeof entry?.marginTop === 'number' && entry.marginTop < -80),
    );
    expect(layer.length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('keeps a baby on its base sheet however it has been trained', () => {
    const { sheetForPet } = require('../components/petSprites');
    const runnerStats = { id: 'p', breed: 'orangeCat', level: 5, endurance: 80, strength: 10 };
    expect(sheetForPet(runnerStats).label).toBe('Orange Cat');
  });

  it('evolves a grown, endurance-built cat onto the runner sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const runner = { id: 'p', breed: 'orangeCat', level: 12, endurance: 80, strength: 10 };
    expect(sheetForPet(runner).label).toBe('Orange Cat · Runner');
  });

  it('leaves a grown cat with no specialism on its base sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const balanced = { id: 'p', breed: 'orangeCat', level: 40, endurance: 50, strength: 48 };
    expect(sheetForPet(balanced).label).toBe('Orange Cat');
  });

  it('evolves a grown, endurance-built bichon onto the runner sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const runner = { id: 'p', breed: 'bichon', level: 12, endurance: 80, strength: 10 };
    expect(sheetForPet(runner).label).toBe('Bichon · Runner');
  });

  it('keeps a baby bichon on its base sheet however it has been trained', () => {
    const { sheetForPet } = require('../components/petSprites');
    const baby = { id: 'p', breed: 'bichon', level: 5, endurance: 80, strength: 10 };
    expect(sheetForPet(baby).label).toBe('Bichon');
  });

  it('gives the bichon runner its own art and its own frame map', () => {
    // The two are free to animate differently, so the maps are deliberately not
    // compared for equality — only that the evolution is a separate sheet with a
    // frame map of its own, rather than an alias of the base's.
    const { sheetForPet } = require('../components/petSprites');
    const base = sheetForPet({ id: 'p', breed: 'bichon', level: 5 });
    const runner = sheetForPet({ id: 'p', breed: 'bichon', level: 12, endurance: 80, strength: 10 });
    expect(runner.source).not.toBe(base.source);
    expect(runner.animations).not.toBe(base.animations);
  });

  it('defines every animation on every sheet, evolutions included', () => {
    // Now that each sheet carries its own map, a form can lose an animation
    // without anything else noticing until the pet renders nothing in that state.
    const animations = ['idle', 'cheer', 'move', 'rest', 'unwell', 'sad', 'faint'];
    const everySheet = PET_SHEETS.flatMap((sheet: any) => [
      sheet,
      ...Object.values(sheet.evolutions ?? {}),
    ]);
    for (const sheet of everySheet as any[]) {
      for (const name of animations) {
        expect(Array.isArray(sheet.animations[name])).toBe(true);
        expect(sheet.animations[name].length).toBeGreaterThan(0);
      }
    }
  });

  it('has no evolution for breeds without evolved art, however trained', () => {
    const { sheetForPet } = require('../components/petSprites');
    const shiba = { id: 'p', breed: 'shiba', level: 40, endurance: 90, strength: 10 };
    expect(sheetForPet(shiba).name).toBe('shiba');
  });

  it('only references frames that exist on the sheet', () => {
    // Evolutions included: they hang off a base sheet rather than sitting in
    // PET_SHEETS, so iterating the list alone would leave their frames unchecked.
    const everySheet = PET_SHEETS.flatMap((sheet: any) => [
      sheet,
      ...Object.values(sheet.evolutions ?? {}),
    ]);
    expect(everySheet.length).toBeGreaterThan(PET_SHEETS.length);
    for (const sheet of everySheet as any[]) {
      const maxRows = sheet.rows ?? 11;
      const maxColumns = sheet.columns ?? 4;
      for (const frames of Object.values(sheet.animations) as [number, number][][]) {
        expect(frames.length).toBeGreaterThan(0);
        for (const [row, column] of frames) {
          expect(row).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThan(maxRows);
          expect(column).toBeGreaterThanOrEqual(0);
          expect(column).toBeLessThan(maxColumns);
        }
      }
    }
  });
});
