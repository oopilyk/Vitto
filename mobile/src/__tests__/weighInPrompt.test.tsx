import { act } from 'react-test-renderer';
import renderer from 'react-test-renderer';
import { WeighInPrompt, daysSinceWeighIn, weighInDue } from '../petWorld/WeighInPrompt';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe('the weekly weigh-in', () => {
  it('is due before the first weigh-in, and a week after each one', () => {
    expect(weighInDue([])).toBe(true);
    expect(daysSinceWeighIn([])).toBeNull();
    expect(weighInDue([{ at: daysAgo(2) }])).toBe(false);
    expect(weighInDue([{ at: daysAgo(6) }])).toBe(false);
    expect(weighInDue([{ at: daysAgo(7) }])).toBe(true);
    expect(daysSinceWeighIn([{ at: daysAgo(9) }])).toBe(9);
  });

  it('shows nothing on Home until it is due', async () => {
    const props = { unit: 'lb' as const, onLog: async () => {}, onOpenChart: () => {}, bottom: 90 };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<WeighInPrompt {...props} recentKg={[{ at: daysAgo(3), kg: 80 }]} />);
    });
    expect(tree.toJSON()).toBeNull();
    await act(async () => {
      tree.update(<WeighInPrompt {...props} recentKg={[{ at: daysAgo(8), kg: 80 }]} />);
    });
    expect(tree.root.findAll((node) => node.props.testID === 'weigh-in-pill').length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});
