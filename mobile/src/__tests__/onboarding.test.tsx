import { useState, type ComponentProps } from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile } from '@vitto/core';
import { OnboardingScreen } from '../screens/OnboardingScreen';

// The pet animates on real timers, and taps advance after a short beat.
jest.useFakeTimers();

jest.mock('../services/billingService', () => {
  const actual = jest.requireActual('../services/billingService');
  return { ...actual, billingService: { status: jest.fn(() => Promise.resolve({ enabled: true, tier: 'free', expiresAt: null })), purchase: jest.fn(), cancel: jest.fn(), restore: jest.fn() } };
});
jest.mock('../services/pushService', () => ({ scheduleTrialReminder: jest.fn(), cancelTrialReminder: jest.fn() }));

const mockHaptics = { selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()) };
jest.mock('expo-haptics', () => ({
  selectionAsync: (...args: unknown[]) => mockHaptics.selectionAsync(...(args as [])),
  impactAsync: (...args: unknown[]) => mockHaptics.impactAsync(...(args as [])),
  notificationAsync: (...args: unknown[]) => mockHaptics.notificationAsync(...(args as [])),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const baseProfile: BodyProfile = {
  age: 30,
  sex: 'other',
  heightCm: 175,
  heightUnit: 'ft',
  weightKg: 82, // ~181 lb
  weightUnit: 'lb',
  activity: 'moderate',
  goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
};

type Overrides = Partial<ComponentProps<typeof OnboardingScreen>>;

/** The screen with its answers actually applied, the way App holds them. */
function Harness({ initial, overrides, log }: { initial: BodyProfile; overrides: Overrides; log: [string, unknown][] }) {
  const [profile, setProfile] = useState(initial);
  const [name, setName] = useState('Miso');
  const [personality, setPersonality] = useState<ComponentProps<typeof OnboardingScreen>['personality']>('sweet');
  const [stepGoal, setStepGoal] = useState(10000);
  return (
    <OnboardingScreen
      name={name}
      onNameChange={setName}
      breed="shiba"
      onBreedChange={() => {}}
      personality={personality}
      onPersonalityChange={setPersonality}
      stepGoal={stepGoal}
      onStepGoalChange={setStepGoal}
      onSetUnits={() => {}}
      profile={profile}
      onUpdate={(key, value) => {
        log.push([key as string, value]);
        setProfile((current) => ({ ...current, [key]: value }));
      }}
      onAdopt={() => {}}
      error={null}
      {...overrides}
    />
  );
}

const mount = (profile: BodyProfile = baseProfile, overrides: Overrides = {}) => {
  const updates: [string, unknown][] = [];
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Harness initial={profile} overrides={overrides} log={updates} />);
  });
  return { tree, updates };
};

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => [n.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''));
const has = (tree: renderer.ReactTestRenderer, text: string) => strings(tree).some((s) => s.includes(text));

const button = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function').find((n) => n.findAllByType(Text).some((t: any) => t.props.children === label));

const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof (n.props.onPress ?? n.props.onChangeText) === 'function')[0];
const tapLabel = (tree: renderer.ReactTestRenderer, label: string) => {
  act(() => byLabel(tree, label)!.props.onPress());
  act(() => {
    jest.advanceTimersByTime(250);
  });
};
const type = (tree: renderer.ReactTestRenderer, label: string, text: string) => {
  act(() => byLabel(tree, label)!.props.onChangeText(text));
};

/** Presses, then lets any tap-to-advance beat pass. */
const press = (tree: renderer.ReactTestRenderer, label: string) => {
  const target = button(tree, label);
  if (!target) throw new Error(`no button "${label}" on: ${strings(tree).join(' | ')}`);
  act(() => target.props.onPress());
  act(() => {
    jest.advanceTimersByTime(250);
  });
};

/** From the welcome screen to the first question about you. */
const meetPet = (tree: renderer.ReactTestRenderer) => {
  press(tree, 'Get started');
  tapLabel(tree, 'Choose the Shiba');
  press(tree, 'Choose the shiba');
  press(tree, 'Let’s go!'); // meet them
  type(tree, "Your companion's name", 'Miso');
  press(tree, 'Next'); // name
  press(tree, 'Skip'); // your name
  chooseCareAreas(tree);
};

/** What should keep the pet healthy: nothing preselected, so pick one and go on. */
const chooseCareAreas = (tree: renderer.ReactTestRenderer) => {
  press(tree, 'Food');
  press(tree, 'Next');
};

describe('onboarding', () => {
  it('opens on the pets, and meets yours before asking anything about you, with nothing chosen for you', () => {
    const { tree } = mount();
    expect(has(tree, 'A companion that grows with you.')).toBe(true);
    press(tree, 'Get started');
    expect(has(tree, 'Choose your companion!')).toBe(true);
    // No animal is picked until one is tapped.
    expect(button(tree, 'Choose your companion')!.props.disabled).toBe(true);
    tapLabel(tree, 'Choose the Shiba');
    mockHaptics.notificationAsync.mockClear();
    press(tree, 'Choose the shiba');
    // The one they chose, celebrating, with the big buzz.
    expect(has(tree, 'You chose the shiba!')).toBe(true);
    expect(tree.root.findAll((n) => n.props.testID === 'meet-pet').length).toBeGreaterThan(0);
    expect(mockHaptics.notificationAsync).toHaveBeenCalled();
    press(tree, 'Let’s go!');
    expect(has(tree, 'What do you want to call me?')).toBe(true);
    // The name starts empty, not as the app's placeholder name.
    expect(byLabel(tree, "Your companion's name")!.props.value).toBe('');
    expect(button(tree, 'Next')!.props.disabled).toBe(true);
    press(tree, 'Shuffle');
    expect(button(tree, 'Next')!.props.disabled).toBe(false);
    press(tree, 'Next');
    expect(has(tree, 'what’s your name?')).toBe(true);
    press(tree, 'Skip');
    // What should keep the pet healthy: nothing chosen for you, and no going on without one.
    expect(has(tree, 'What should keep') && has(tree, 'healthy?')).toBe(true);
    expect(button(tree, 'Next')!.props.disabled).toBe(true);
    chooseCareAreas(tree);
    expect(has(tree, 'Let’s learn a bit about you!')).toBe(true);
  });

  it('asks one question a screen, moving on with a haptic tick as soon as one is tapped', () => {
    const { tree, updates } = mount();
    meetPet(tree);
    press(tree, 'Next'); // about you intro
    expect(has(tree, 'How old are you?')).toBe(true);
    // The pet you chose stays on screen through the questions.
    expect(byLabel(tree, 'Say hi to Miso')).toBeTruthy();
    mockHaptics.selectionAsync.mockClear();
    press(tree, '18-24');
    expect(mockHaptics.selectionAsync).toHaveBeenCalled();
    expect(updates).toContainEqual(['age', 21]);
    expect(has(tree, 'What’s your sex?')).toBe(true);
    press(tree, 'Prefer not to answer');
    expect(updates).toContainEqual(['sex', 'other']);
    // Height and weight in the user's own units, empty until typed.
    expect(byLabel(tree, 'Weight in lb')!.props.value).toBe('');
    expect(byLabel(tree, 'Height in feet')).toBeTruthy();
    expect(button(tree, 'Next')!.props.disabled).toBe(true);
    type(tree, 'Height in feet', '5');
    type(tree, 'Height in inches', '10');
    type(tree, 'Weight in lb', '180');
    expect(button(tree, 'Next')!.props.disabled).toBe(false);
  });

  it('skips the target weight for someone holding steady, and asks it, unfilled, for everyone else', () => {
    const toGoal = (tree: renderer.ReactTestRenderer) => {
      meetPet(tree);
      press(tree, 'Next');
      press(tree, '25-34');
      press(tree, 'Male');
      type(tree, 'Height in feet', '5');
      type(tree, 'Weight in lb', '180');
      press(tree, 'Next');
    };
    const steady = mount();
    toGoal(steady.tree);
    press(steady.tree, 'Stay where I am');
    expect(has(steady.tree, 'how active is your day?')).toBe(true);
    // Nothing chosen for them here either.
    expect(steady.tree.root.findAll((n) => n.props.accessibilityState?.selected === true)).toHaveLength(0);

    const cutting = mount();
    toGoal(cutting.tree);
    press(cutting.tree, 'Lose fat');
    expect(has(cutting.tree, 'What weight are you aiming for?')).toBe(true);
    expect(byLabel(cutting.tree, 'Goal weight in lb')!.props.value).toBe('');
    expect(button(cutting.tree, 'Next')!.props.disabled).toBe(true);
    type(cutting.tree, 'Goal weight in lb', '170');
    // The month after next, whenever this runs.
    const base = new Date();
    const month = new Date(base.getFullYear(), base.getMonth() + 2, 1).toLocaleDateString([], { month: 'short', year: 'numeric' });
    press(cutting.tree, month);
    expect(button(cutting.tree, 'Next')!.props.disabled).toBe(false);
    expect(cutting.updates.some(([key]) => key === 'goalTargetDate')).toBe(true);
  });

  it('shows the starter plan, then three pages of what Plus gives, then the offer', async () => {
    const { billingService } = jest.requireMock('../services/billingService');
    billingService.purchase.mockResolvedValueOnce({ enabled: true, tier: 'plus', expiresAt: null });
    const tiers: string[] = [];
    const { tree } = mount({ ...baseProfile, targetWeightKg: 75, motivations: ['pet'] }, { canCustomise: false, paywall: { onTierChange: (tier) => tiers.push(tier) } });
    meetPet(tree);
    // Answers already on file: straight from the pet to the plan.
    expect(tree.root.findAll((n) => n.props.testID === 'starter-plan').length).toBeGreaterThan(0);
    press(tree, 'Let’s do it!');
    expect(has(tree, 'Make Miso truly yours')).toBe(true);
    press(tree, 'Next');
    expect(has(tree, 'Snap a photo, get the macros')).toBe(true);
    press(tree, 'Next');
    expect(has(tree, 'Talk with Miso anytime')).toBe(true);
    press(tree, 'Next');
    expect(tree.root.findAll((n) => n.props.testID === 'plus-offer').length).toBeGreaterThan(0);
    expect(has(tree, 'Start your 14-day free trial')).toBe(true);
    await act(async () => {
      await button(tree, 'Start my free trial')!.props.onPress();
    });
    expect(billingService.purchase).toHaveBeenCalledWith('yearly', true);
    expect(tiers).toEqual(['plus']);
    // Bought: on with onboarding. (In the app the new tier also opens the
    // personality step; here canCustomise is fixed, so it is the next one.)
    expect(has(tree, 'How many days in a row will you take care of')).toBe(true);
  });

  it('lets them pass on the offer', () => {
    const { tree } = mount({ ...baseProfile, targetWeightKg: 75, motivations: ['pet'] }, { canCustomise: false, paywall: { onTierChange: () => {} } });
    meetPet(tree);
    press(tree, 'Let’s do it!');
    press(tree, 'Next');
    press(tree, 'Next');
    press(tree, 'Next');
    press(tree, 'Not now');
    expect(has(tree, 'How many days in a row will you take care of')).toBe(true);
  });

  it('keeps personalities to Plus: no personality step on the free tier', () => {
    const { tree } = mount({ ...baseProfile, targetWeightKg: 75, motivations: ['pet'] }, { canCustomise: false });
    meetPet(tree);
    press(tree, 'Let’s do it!');
    expect(has(tree, 'Their personality')).toBe(false);
    expect(has(tree, 'How many days in a row will you take care of')).toBe(true);
  });

  it('asks for notifications when it can, then a streak to commit to, then day one', async () => {
    const enable = jest.fn(() => Promise.resolve(true));
    const adopt = jest.fn();
    const { tree } = mount({ ...baseProfile, targetWeightKg: 75, motivations: ['pet'] }, { canCustomise: false, onEnableNotifications: enable, onAdopt: adopt });
    meetPet(tree);
    press(tree, 'Let’s do it!');
    expect(has(tree, 'Get reminders from Miso')).toBe(true);
    await act(async () => {
      button(tree, 'Turn on notifications')!.props.onPress();
    });
    expect(enable).toHaveBeenCalled();
    expect(button(tree, 'Commit to this goal!')!.props.disabled).toBe(true);
    press(tree, '7 days');
    press(tree, 'Commit to this goal!');
    expect(has(tree, 'Day 1')).toBe(true);
    await act(async () => {
      await button(tree, 'Start today')!.props.onPress();
    });
    expect(adopt).toHaveBeenCalled();
  });

  it('never scrolls a page and never uses an emoji, all the way through', () => {
    const { ScrollView } = require('react-native');
    const enable = jest.fn(() => Promise.resolve(true));
    const { tree } = mount(baseProfile, { onEnableNotifications: enable });
    const check = () => {
      // The only scroller allowed is the sideways strip of months.
      for (const scroller of tree.root.findAllByType(ScrollView)) expect(scroller.props.horizontal).toBe(true);
      for (const line of strings(tree)) expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
    };
    check();
    press(tree, 'Get started');
    check();
    tapLabel(tree, 'Choose the Shiba');
    check();
    press(tree, 'Choose the shiba');
    check();
    press(tree, 'Let’s go!');
    press(tree, 'Shuffle');
    press(tree, 'Next');
    press(tree, 'Skip');
    check();
    chooseCareAreas(tree);
    check();
    press(tree, 'Next');
    for (const tap of ['18-24', 'Male']) {
      check();
      press(tree, tap);
    }
    check();
    type(tree, 'Height in feet', '5');
    type(tree, 'Weight in lb', '180');
    press(tree, 'Next');
    for (const tap of ['Stay where I am', 'On my feet some', '3 days']) {
      check();
      press(tree, tap);
    }
    check();
    press(tree, 'Next');
    check();
    press(tree, '10,000 steps');
    press(tree, 'Seeing progress');
    check();
    press(tree, 'Next');
    check(); // the plan
  });

  it('claims a username after your name, and shows why when it cannot', async () => {
    const claimed: string[] = [];
    let taken = true;
    const { tree } = mount(baseProfile, {
      onClaimUsername: async (username: string) => {
        if (taken) throw new Error('That username is taken.');
        claimed.push(username);
      },
    });
    press(tree, 'Get started');
    tapLabel(tree, 'Choose the Shiba');
    press(tree, 'Choose the shiba');
    press(tree, 'Let’s go!');
    press(tree, 'Shuffle');
    press(tree, 'Next');
    press(tree, 'Skip');
    expect(has(tree, 'pick a username')).toBe(true);
    // Nothing typed, nothing to claim; and the field keeps to what a username can hold.
    expect(button(tree, 'Next')!.props.disabled).toBe(true);
    type(tree, 'Your username', 'Kyle Li!');
    expect(byLabel(tree, 'Your username')!.props.value).toBe('kyleli');
    await act(async () => {
      await button(tree, 'Next')!.props.onPress();
    });
    expect(has(tree, 'That username is taken.')).toBe(true);
    taken = false;
    await act(async () => {
      await button(tree, 'Next')!.props.onPress();
    });
    expect(claimed).toEqual(['kyleli']);
    // Then what should keep the pet healthy, before anything about you.
    expect(has(tree, 'What should keep') && has(tree, 'healthy?')).toBe(true);
    chooseCareAreas(tree);
    expect(has(tree, 'Let’s learn a bit about you!')).toBe(true);
  });

  it('does not ask for a username someone already has', () => {
    const { tree } = mount({ ...baseProfile, username: 'kyle' }, { onClaimUsername: async () => {} });
    meetPet(tree);
    expect(has(tree, 'Let’s learn a bit about you!')).toBe(true);
  });

  it('the join-a-partner affordance only appears when onRedeemInvite is passed', () => {
    const withInvite = mount(baseProfile, { onRedeemInvite: async () => true });
    expect(button(withInvite.tree, 'Have an invite code? Join a partner’s pet')).toBeTruthy();
    const without = mount(baseProfile);
    expect(button(without.tree, 'Have an invite code? Join a partner’s pet')).toBeUndefined();
  });
});

describe('onboarding character (Plus)', () => {
  const adult: BodyProfile = { ...baseProfile, targetWeightKg: 75, motivations: ['pet'] };
  const atPet = (overrides: Overrides = {}, profile: BodyProfile = adult) => {
    const mounted = mount(profile, overrides);
    meetPet(mounted.tree);
    press(mounted.tree, 'Let’s do it!');
    return mounted.tree;
  };

  it('picks no personality for them, then previews the one they tap, starting its sliders where that base sits', () => {
    const dials: unknown[] = [];
    const tree = atPet({ onDialsChange: (d: unknown) => dials.push(d) });
    expect(has(tree, 'Choose a personality for Miso')).toBe(true);
    expect(button(tree, 'Next')!.props.disabled).toBe(true);
    press(tree, 'Savage');
    expect(tree.root.findAll((n) => n.props.testID === 'personality-preview-savage').length).toBeGreaterThan(0);
    expect(dials.at(-1)).toMatchObject({ sarcastic: 0.92 });
    expect(button(tree, 'Next')!.props.disabled).toBe(false);
  });

  it('asks who they are only for "Your own", and only offers it to adults', () => {
    const own = atPet();
    press(own, 'Your own');
    expect(has(own, 'Who are they?')).toBe(true);
    const teen = atPet({}, { ...adult, age: 15 });
    expect(has(teen, 'Your own')).toBe(false);
    press(teen, 'Cute');
    expect(has(teen, 'Who are they?')).toBe(false);
  });
});
