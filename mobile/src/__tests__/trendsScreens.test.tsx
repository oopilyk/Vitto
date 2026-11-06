import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile, type HealthEvent } from '@vitto/core';
import { FoodTrendsScreen } from '../screens/FoodTrendsScreen';
import { StepTrendsScreen } from '../screens/StepTrendsScreen';

const profile = {
  age: 30, sex: 'other', heightCm: 173, weightKg: 73, heightUnit: 'cm', weightUnit: 'kg', activity: 'moderate', goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
} as BodyProfile;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString(); };
const nutrients = { protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false };
const meal = (n: number): HealthEvent => ({
  id: `m${n}`, userId: 'u', occurredAt: daysAgo(n), type: 'MEAL', source: 'manual',
  metadata: { ...nutrients, loggedVia: 'manual', analysis: { foodDescription: 'Oats', grade: 'A', summary: 'Oats', confidence: 1, detectedFoods: ['oats'], macros: { calories: 1800, proteinGrams: 90, carbsGrams: 200, fatGrams: 60 }, nutrients } },
});
const steps = (n: number, count: number): HealthEvent => ({ id: `s${n}`, userId: 'u', occurredAt: daysAgo(n), type: 'STEP_ACTIVITY', source: 'healthkit', metadata: { steps: count } });
const texts = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.root.findAllByType(Text).map((t) => t.props.children));

describe('trends pages', () => {
  it('food shows the average day and the meals eaten most', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<FoodTrendsScreen events={[meal(1), meal(2)]} profile={profile} onClose={() => {}} />); });
    const all = texts(tree);
    expect(all).toContain('1,800');
    expect(all).toContain('kcal a day');
    expect(all).toContain('Eaten most');
    act(() => tree.unmount());
  });

  it('steps shows the average, best day and the run of goal days', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<StepTrendsScreen events={[steps(1, 12000), steps(2, 8000)]} stepGoal={10000} petName="Blue" miles onClose={() => {}} />); });
    const all = texts(tree);
    expect(all).toContain('10,000');
    expect(all).toContain('12,000');
    expect(all).toContain('goal day in a row');
    expect(all).toContain(' mi');
    act(() => tree.unmount());
  });
});
