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
  const button = tree.root.findAll((n) => typeof n.props.onPress === 'function').find((n) => n.findAllByType(Text).some((t) => t.props.children === label));
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
    expect(plus[0]!.body).toContain('Miso');
  });

  it('steps through to the end, and can be skipped at any point', () => {
    const steps = tourSteps('Miso', true);
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TourProvider>
          {(['kitchen', 'gym', 'outside', 'today', 'chat', 'account'] as const).map((id) => <Target key={id} id={id} />)}
          <FirstRunTour steps={steps} onDone={done} />
        </TourProvider>,
      );
    });
    act(() => jest.advanceTimersByTime(200));
    expect(texts(tree)).toContain('1 of 6');
    expect(texts(tree)).toContain('Meals go in the kitchen');
    for (let i = 0; i < 5; i += 1) press(tree, 'Next');
    expect(texts(tree)).toContain('6 of 6');
    // The last step has no skip, only the finish.
    expect(texts(tree)).not.toContain('Skip tour');
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
    press(tree, 'Skip tour');
    expect(skipped).toHaveBeenCalledTimes(1);
    tree.unmount();
  });
});
