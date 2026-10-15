import renderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { FirstRunTour, TourProvider, tourSteps, useTourTarget, type TourStep, type TourTargetId } from '../tour/FirstRunTour';

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
  it('walks through where to log, then today, chat and the account menu; personality only on Plus', () => {
    const home = ['kitchen', 'gym', 'outside', 'study', 'today', 'chat', 'level', 'account'];
    const free = tourSteps('Miso', false);
    expect(free.map((step) => step.target)).toEqual(home);
    // Without Plus the personality page is only a locked note: the tour never goes there.
    expect(free.every((step) => step.page === undefined)).toBe(true);
    expect(free.map((step) => step.body).join(' ')).not.toContain('Personality');
    expect(free[7]!.body).toContain('friends');
    // On Plus it ends on the personality page itself, pointing at the choices.
    const plus = tourSteps('Miso', true);
    expect(plus.map((step) => step.target)).toEqual([...home, 'personality']);
    expect(plus.slice(0, 8).every((step) => step.page === undefined)).toBe(true);
    expect(plus[8]!.page).toBe('personality');
    expect(plus[8]!.body).toContain('Miso');
    expect(plus[8]!.body).toContain('Your own');
    expect(plus[8]!.body).toContain('Save character');
    expect(plus[0]!.body).toContain('Log meal');
  });

  it('steps through to the end, and can be skipped at any point', () => {
    const steps = tourSteps('Miso', false);
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TourProvider>
          {(['kitchen', 'gym', 'outside', 'study', 'today', 'chat', 'level', 'account'] as const).map((id) => <Target key={id} id={id} />)}
          <FirstRunTour steps={steps} onDone={done} speaker="Miso" />
        </TourProvider>,
      );
    });
    act(() => jest.advanceTimersByTime(200));
    // It opens on a welcome, offering the tour rather than springing it.
    expect(texts(tree)).toContain('WELCOME HOME!');
    expect(texts(tree)).toContain('MAYBE LATER');
    act(() => jest.advanceTimersByTime(5000));
    press(tree, 'Show me around');
    act(() => jest.advanceTimersByTime(200));
    const progress = () => tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && / of 8$/.test(n.props.accessibilityLabel))[0]!.props.accessibilityLabel;
    expect(progress()).toBe('1 of 8');
    expect(texts(tree)).toContain('THE KITCHEN');
    expect(texts(tree)).toContain('MISO');
    // The line types itself out: the first Next finishes it, the second moves on.
    press(tree, 'Next');
    expect(progress()).toBe('1 of 8');
    press(tree, 'Next');
    expect(progress()).toBe('2 of 8');
    for (let i = 0; i < 6; i += 1) {
      act(() => jest.advanceTimersByTime(5000));
      press(tree, 'Next');
    }
    expect(progress()).toBe('8 of 8');
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
    // "Maybe later" on the welcome skips the whole tour.
    press(tree, 'Maybe later');
    expect(skipped).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('on Plus, opens the personality page for the last step and points at the choices there', () => {
    const steps = tourSteps('Miso', true);
    const done = jest.fn();
    const onPage = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    // As in the app: an outer provider round every screen, the dashboard's own
    // inside it, and the personality choices on a page outside the dashboard.
    const render = (onPersonalityPage: boolean) => (
      <TourProvider>
        <TourProvider>
          {(['kitchen', 'gym', 'outside', 'study', 'today', 'chat', 'level', 'account'] as const).map((id) => <Target key={id} id={id} />)}
          <FirstRunTour steps={steps} onDone={done} onPage={onPage} speaker="Miso" />
        </TourProvider>
        {onPersonalityPage ? <Target id="personality" /> : null}
      </TourProvider>
    );
    act(() => {
      tree = renderer.create(render(false));
    });
    act(() => jest.advanceTimersByTime(5000));
    press(tree, 'Show me around');
    const progress = () => tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && / of 9$/.test(n.props.accessibilityLabel))[0]!.props.accessibilityLabel;
    for (let i = 0; i < 8; i += 1) {
      act(() => jest.advanceTimersByTime(5000));
      // Nothing is opened on the way: every step before it is on the main screen.
      expect(onPage).not.toHaveBeenCalled();
      press(tree, 'Next');
    }
    expect(progress()).toBe('9 of 9');
    expect(texts(tree)).toContain('MY PERSONALITY');
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onPage).toHaveBeenLastCalledWith('personality');
    // The page arrives a moment later; the tour finds its target once it does.
    expect(tree.root.findAllByProps({ testID: 'tour-ring' })).toHaveLength(0);
    act(() => tree.update(render(true)));
    // Give the page's target a place on screen, as the device would.
    const page = tree.root.findAll((n) => n.props.testID === 'target-personality' && typeof n.instance?.measureInWindow === 'function')[0]!;
    page.instance.measureInWindow = (done: (x: number, y: number, w: number, h: number) => void) => done(16, 300, 340, 200);
    act(() => jest.advanceTimersByTime(300));
    expect(tree.root.findAllByProps({ testID: 'tour-ring' }).length).toBeGreaterThan(0);
    // Finishing there ends the tour and leaves them on the page to choose.
    act(() => jest.advanceTimersByTime(5000));
    press(tree, "Let's go");
    expect(done).toHaveBeenCalledTimes(1);
    expect(onPage).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('comes back to the main screen for a step after one on a page, and can be skipped there', () => {
    const steps: TourStep[] = [
      { target: 'personality', page: 'personality', title: 'Page', body: 'On the page.' },
      { target: 'account', title: 'Home', body: 'Back home.' },
      { target: 'chat', title: 'Chat', body: 'Still home.' },
    ];
    const onPage = jest.fn();
    const done = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TourProvider>
          <FirstRunTour steps={steps} onDone={done} onPage={onPage} />
        </TourProvider>,
      );
    });
    act(() => jest.advanceTimersByTime(5000));
    press(tree, 'Show me around');
    expect(onPage.mock.calls).toEqual([['personality']]);
    act(() => jest.advanceTimersByTime(5000));
    press(tree, 'Next');
    expect(onPage.mock.calls).toEqual([['personality'], [null]]);
    press(tree, 'Skip');
    expect(done).toHaveBeenCalledTimes(1);
    expect(onPage.mock.calls).toEqual([['personality'], [null]]);
    tree.unmount();
  });
});
