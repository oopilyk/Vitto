import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile } from '@vitto/core';
import { OnboardingScreen } from '../screens/OnboardingScreen';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const baseProfile: BodyProfile = {
  age: 30,
  sex: 'other',
  heightCm: 175,
  heightUnit: 'cm',
  weightKg: 75,
  weightUnit: 'kg',
  activity: 'moderate',
  goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
};

type Overrides = Partial<ComponentProps<typeof OnboardingScreen>>;

const mount = (profile: BodyProfile, overrides: Overrides = {}) => {
  const updates: [string, unknown][] = [];
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <OnboardingScreen
        name="Miso"
        onNameChange={() => {}}
        breed="shiba"
        onBreedChange={() => {}}
        personality="supportive"
        onPersonalityChange={() => {}}
        stepGoal={10000}
        onStepGoalChange={() => {}}
        profile={profile}
        onUpdate={(key, value) => updates.push([key as string, value])}
        onAdopt={() => {}}
        error={null}
        {...overrides}
      />,
    );
  });
  return { tree, updates };
};

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) =>
      [n.props.children]
        .flat()
        .filter((c) => typeof c === 'string' || typeof c === 'number')
        .join(''),
    );

const button = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((n) => typeof n.props.onPress === 'function')
    .find((n) => n.findAllByType(Text).some((t: any) => t.props.children === label));

const advanceToStep = (tree: renderer.ReactTestRenderer, marker: string, max = 15) => {
  for (let i = 0; i < max; i += 1) {
    if (strings(tree).some((s) => s.includes(marker))) return;
    const next = button(tree, 'Continue') ?? button(tree, 'Get started');
    if (!next) break;
    act(() => next.props.onPress());
  }
  throw new Error(`never reached step "${marker}"`);
};

describe('OnboardingScreen flow', () => {
  it('starts a brand-new user at the welcome step', () => {
    const { tree } = mount(baseProfile);
    expect(strings(tree)).toEqual(expect.arrayContaining(['Step 1 of 10']));
    expect(strings(tree).join(' ')).toContain('A companion that grows with you.');
  });

  it('skips the weight step for a goal that does not move the scale', () => {
    const { tree } = mount({ ...baseProfile, primaryGoal: 'build_habits' });
    expect(strings(tree).some((s) => s === 'Step 1 of 10')).toBe(true);
    advanceToStep(tree, 'How do you train?');
    expect(strings(tree).join(' ')).not.toContain('How do you want to eat for that?');
  });

  it('shows the weight step for a weight-change goal', () => {
    const { tree } = mount({ ...baseProfile, primaryGoal: 'lose_weight', goal: 'lose' });
    expect(strings(tree).some((s) => s === 'Step 1 of 11')).toBe(true);
    advanceToStep(tree, 'How do you want to eat for that?');
  });

  it('picking a primary goal seeds the energy-balance axis', () => {
    const { tree, updates } = mount(baseProfile);
    advanceToStep(tree, 'What are you mainly working toward?');
    act(() => button(tree, 'Lose weight')!.props.onPress());
    expect(updates).toEqual(
      expect.arrayContaining([
        ['primaryGoal', 'lose_weight'],
        ['goal', 'lose'],
      ]),
    );
  });

  it('resumes at the companion once the questionnaire is answered', () => {
    const { tree } = mount({
      ...baseProfile,
      primaryGoal: 'get_stronger',
      motivations: ['pet', 'progress'],
    });
    expect(strings(tree).join(' ')).toContain('Who’s coming with you?');
  });

  it('the join-a-partner affordance only appears when onRedeemInvite is passed', () => {
    const withInvite = mount(baseProfile, { onRedeemInvite: async () => true });
    expect(button(withInvite.tree, 'Have an invite code? Join a partner’s pet')).toBeTruthy();
    const without = mount(baseProfile);
    expect(button(without.tree, 'Have an invite code? Join a partner’s pet')).toBeUndefined();
  });
});
