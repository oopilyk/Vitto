import renderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { FirstRunTour, TourProvider, tourSteps, useTourTarget, type TourTargetId } from '../tour/FirstRunTour';

jest.useFakeTimers();

function Target({ id }: { id: TourTargetId }) {
  const ref = useTourTarget(id);
  return <View ref={ref} testID={`target-${id}`} />;
}

const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const press = (tree: renderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findAll((n) => typeof n.props.onPress === 'function').find((n) => n.props.accessibilityLabel === label || n.findAllByType(Text).some((t) => t.props.children === label));
  if (!button) throw new Error(`no "${label}" on: ${texts(tree).join(' | ')}`);
  act(() => button.props.onPress());
};

describe('first-run tour', () => {
  it('walks through where to log, then today and chat; personality only on Plus', () => {
    const free = tourSteps('Miso', false).map((step) => step.target);
    expect(free).toEqual(['kitchen', 'gym', 'outside', 'today', 'chat']);
    const plus = tourSteps('Miso', true);
    expect(plus.map((step) => step.target)).toEqual(['kitchen', 'gym', 'outside', 'today', 'chat', 'account']);
    expect(plus[5]!.body).toContain('Settings → Personality');
    expect(plus[5]!.body).toContain('Miso');
    expect(plus[0]!.body).toContain('Log meal');
  });

  it('steps through to the end, and can be skipped at any point', () => {
    const steps = tourSteps('Miso', true);
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TourProvider>
          {(['kitchen', 'gym', 'outside', 'today', 'chat', 'account'] as const).map((id) => <Target key={id} id={id} />)}
          <FirstRunTour steps={steps} onDone={done} speaker="Miso" />
        </TourProvider>,
      );
    });
    act(() => jest.advanceTimersByTime(200));
    const progress = () => tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && / of 6$/.test(n.props.accessibilityLabel))[0]!.props.accessibilityLabel;
    expect(progress()).toBe('1 of 6');
    expect(texts(tree)).toContain('THE KITCHEN');
    expect(texts(tree)).toContain('MISO');
    // The line types itself out: the first Next finishes it, the second moves on.
    press(tree, 'Next');
    expect(progress()).toBe('1 of 6');
    press(tree, 'Next');
    expect(progress()).toBe('2 of 6');
    for (let i = 0; i < 4; i += 1) {
      act(() => jest.advanceTimersByTime(5000));
      press(tree, 'Next');
    }
    expect(progress()).toBe('6 of 6');
    // The last step has no skip, only the finish.
    expect(texts(tree)).not.toContain('SKIP');
    act(() => jest.advanceTimersByTime(5000));
    press(tree, "Let's go");
    expect(done).toHaveBeenCalledTimes(1);
    tree.unmount();

    const skipped = jest.fn();
    act(() => {
      tree = renderer.create(
        <TourProvider>
          <FirstRunTour steps={steps} onDone={skipped} />
        </TourProvider>,
      );
    });
    press(tree, 'SKIP');
    expect(skipped).toHaveBeenCalledTimes(1);
    tree.unmount();
  });
});
