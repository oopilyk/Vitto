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
  heightUnit: 'ft',
  weightKg: 82, // ~181 lb
  weightUnit: 'lb',
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
        onSetUnits={() => {}}
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

const advanceToStep = (tree: renderer.ReactTestRenderer, marker: string, max = 12) => {
  for (let i = 0; i < max; i += 1) {
    if (strings(tree).some((s) => s.includes(marker))) return;
    const next = button(tree, 'Continue') ?? button(tree, 'Get started');
    if (!next) break;
    act(() => next.props.onPress());
  }
  throw new Error(`never reached step "${marker}"`);
};

describe('OnboardingScreen flow', () => {
  it('starts a brand-new user at the welcome step of an 8-step flow', () => {
    const { tree } = mount(baseProfile);
    expect(strings(tree)).toEqual(expect.arrayContaining(['Step 1 of 8']));
    expect(strings(tree).join(' ')).toContain('A companion that grows with you.');
  });

  it('offers no metric unit options — American only', () => {
    const { tree } = mount(baseProfile);
    advanceToStep(tree, 'A few basics.');
    const all = strings(tree).join(' ');
    expect(all).toContain('Weight (lb)');
    expect(all).toContain('Height (ft)');
    expect(all).not.toContain('Kilograms');
    expect(all).not.toContain('Centimeters');
  });

  it('the goal step shows current weight and derives the calorie axis from the target', () => {
    const { tree, updates } = mount(baseProfile);
    advanceToStep(tree, 'What are you working toward?');
    expect(strings(tree).join(' ')).toContain('181 lb');
    const goalField = tree.root
      .findAll((n) => typeof n.props.onChangeText === 'function')
      .find((n) => n.props.placeholder === '181');
    act(() => goalField!.props.onChangeText('165'));
    expect(updates).toEqual(expect.arrayContaining([['goal', 'lose']]));
    expect(updates.some(([k]) => k === 'targetWeightKg')).toBe(true);
  });

  it('the commitments step asks preferences, not current activity only', () => {
    // Goal step needs a target + date before it will advance.
    const { tree } = mount({ ...baseProfile, targetWeightKg: 75, goalTargetDate: '2026-12-01' });
    advanceToStep(tree, 'What will you hold yourself to?');
    const all = strings(tree).join(' ');
    expect(all).toContain('Days a week you’ll train');
    expect(all).toContain('Daily step goal');
  });

  it('resumes at the companion once a goal weight and a motivation are set', () => {
    const { tree } = mount({ ...baseProfile, targetWeightKg: 75, motivations: ['pet'] });
    expect(strings(tree).join(' ')).toContain('Who’s coming with you?');
  });

  it('the join-a-partner affordance only appears when onRedeemInvite is passed', () => {
    const withInvite = mount(baseProfile, { onRedeemInvite: async () => true });
    expect(button(withInvite.tree, 'Have an invite code? Join a partner’s pet')).toBeTruthy();
    const without = mount(baseProfile);
    expect(button(without.tree, 'Have an invite code? Join a partner’s pet')).toBeUndefined();
  });
});
