import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { HealthEvent } from '@vitto/core';
import { StrengthMap, TIER_COLOR } from '../components/StrengthMap';

const lift = (name: string, weight: number, reps: number) => ({ id: name, name, muscleGroup: 'x', sets: [{ id: `${name}-s`, reps, weight, unit: 'lb', completed: true }] });
const events = [
  { id: 'w', type: 'WORKOUT', source: 'manual', occurredAt: '2026-09-30T12:00:00Z', metadata: { workoutType: 'strength', durationMinutes: 60, exercises: [lift('Bench Press', 315, 1)] } },
] as unknown as HealthEvent[];

const render = (sex: 'male' | 'female', log: HealthEvent[]) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StrengthMap profile={{ sex, weightKg: 81.6, weightUnit: 'lb' }} events={log} />);
  });
  return tree;
};
const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));

describe('StrengthMap', () => {
  it('lights the chest Grand Champion red for a 315 bench, and leaves untested muscles grey', () => {
    const tree = render('male', events);
    const chest = tree.root.findAll((n) => n.props.testID === 'muscle-maleFront-chest' && n.props.tintColor);
    expect(chest[0]!.props.tintColor).toBe(TIER_COLOR[6]);
    // Triceps average bench and press; with only bench logged they follow it.
    expect(tree.root.findAll((n) => n.props.testID === 'muscle-maleBack-triceps').length).toBeGreaterThan(0);
    // Nothing trains the quads yet, so there is no tint to draw.
    expect(tree.root.findAll((n) => n.props.testID === 'muscle-maleFront-quads')).toHaveLength(0);
    expect(texts(tree).some((t) => t.includes('Chest · Grand Champion'))).toBe(true);
    tree.unmount();
  });

  it('uses the female body for a female profile, and prompts when nothing is logged', () => {
    const tree = render('female', []);
    expect(tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('muscle-'))).toHaveLength(0);
    expect(texts(tree).some((t) => t.includes('Log a bench'))).toBe(true);
    tree.unmount();
    const strong = render('female', events);
    expect(strong.root.findAll((n) => n.props.testID === 'muscle-femaleFront-chest').length).toBeGreaterThan(0);
    strong.unmount();
  });

  it('keeps the lifts folded away, with the closest rank-up showing', () => {
    const tree = render('male', events);
    expect(tree.root.findAll((n) => n.props.testID === 'lift-bench')).toHaveLength(0);
    // 315 is already the top rank, so there is no rank-up to show from bench alone.
    expect(tree.root.findAll((n) => n.props.testID === 'next-rank-up')).toHaveLength(0);
    act(() => tree.root.findAll((n) => n.props.testID === 'toggle-lifts' && typeof n.props.onPress === 'function')[0]!.props.onPress());
    expect(tree.root.findAll((n) => n.props.testID === 'lift-bench').length).toBeGreaterThan(0);
    tree.unmount();
    const climbing = render('male', [{ ...events[0]!, metadata: { workoutType: 'strength', durationMinutes: 60, exercises: [lift('Squat', 300, 1)] } } as unknown as HealthEvent]);
    const line = climbing.root.findAll((n) => n.props.testID === 'next-rank-up')[0]!;
    expect(line.findAllByType(Text).some((t) => t.props.children === 'Squat')).toBe(true);
    climbing.unmount();
  });
});
