import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { CLIP_SWAP_TIMEOUT_MS, PetClipStack, PetVideo } from '../components/PetVideo';

const players: { play: jest.Mock; duration: number; currentTime: number }[] = [];
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    useVideoPlayer: (_source: unknown, setup?: (player: unknown) => void) => {
      const player = { loop: false, muted: false, play: jest.fn(), pause: jest.fn(), duration: 4, currentTime: 1 };
      setup?.(player);
      players.push(player);
      return player;
    },
    VideoView: (props: object) => require('react').createElement(View, props),
  };
});

const videos = { frameSize: 768, cell: { x: 0, y: 0, size: 768 }, clips: {} } as never;

/** Renders a clip and returns a way to send the app back to the foreground. */
const mount = (loop: boolean) => {
  let onChange: ((state: string) => void) | undefined;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onChange = handler as (state: string) => void;
    return { remove: () => {} } as never;
  });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PetVideo videos={videos} clip={{ hevc: 1, webm: 2, loop }} size={128} />);
  });
  spy.mockRestore();
  const player = players[players.length - 1]!;
  player.play.mockClear();
  return { player, returnToApp: () => act(() => onChange?.('active')), tree };
};

describe('PetVideo after a trip out of the app', () => {
  it('resumes a looping clip, which iOS paused in the background', () => {
    const { player, returnToApp, tree } = mount(true);
    returnToApp();
    expect(player.play).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('resumes a play-once clip that had not finished yet', () => {
    const { player, returnToApp, tree } = mount(false);
    returnToApp();
    expect(player.play).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('leaves a finished play-once clip on its held last pose', () => {
    const { player, returnToApp, tree } = mount(false);
    player.currentTime = player.duration;
    returnToApp();
    expect(player.play).not.toHaveBeenCalled();
    tree.unmount();
  });
});

describe('PetVideo while another screen covers the pet', () => {
  it('pauses, stays paused through a return to the app, and picks back up once uncovered', () => {
    let onChange: ((state: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler as (state: string) => void;
      return { remove: () => {} } as never;
    });
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PetVideo videos={videos} clip={{ hevc: 1, loop: true }} size={128} paused />);
    });
    const player = players[players.length - 1]! as { play: jest.Mock; pause?: jest.Mock };
    expect((player as any).pause).toHaveBeenCalled();
    player.play.mockClear();
    act(() => onChange?.('active'));
    expect(player.play).not.toHaveBeenCalled();

    act(() => tree.update(<PetVideo videos={videos} clip={{ hevc: 1, loop: true }} size={128} paused={false} />));
    // (The mock hands out a fresh player per render; the real hook keeps one.)
    expect(players[players.length - 1]!.play).toHaveBeenCalled();
    spy.mockRestore();
    tree.unmount();
  });
});

describe('PetClipStack switching clips', () => {
  let appState: jest.SpyInstance;
  beforeEach(() => {
    appState = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => {} }) as never);
  });
  afterEach(() => appState.mockRestore());

  const idle = { hevc: 1, loop: true };
  const cheer = { hevc: 2, loop: false };
  const render = (clipKey: string, clip: typeof idle) => (
    <PetClipStack clipKey={clipKey} videos={videos} clip={clip} size={128} />
  );
  /** Each clip on screen, and whether it is the hidden incoming one. */
  const layersOf = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAllByType(PetVideo).map((node) => ({
      hevc: (node.props.clip as typeof idle).hevc,
      hidden: (node.parent!.props.style as [unknown, { opacity: number }])[1].opacity === 0,
      firstFrame: node.props.onFirstFrame as (() => void) | undefined,
    }));

  it('keeps the old clip showing until the new one has drawn its first frame', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(render('idle', idle));
    });
    act(() => tree.update(render('celebrate', cheer)));
    expect(layersOf(tree).map(({ hevc, hidden }) => ({ hevc, hidden }))).toEqual([
      { hevc: 1, hidden: false },
      { hevc: 2, hidden: true },
    ]);

    act(() => layersOf(tree)[1]!.firstFrame!());
    expect(layersOf(tree).map(({ hevc, hidden }) => ({ hevc, hidden }))).toEqual([{ hevc: 2, hidden: false }]);
    act(() => tree.unmount());
  });

  it('takes over anyway if the first frame is never reported', () => {
    jest.useFakeTimers();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(render('idle', idle));
    });
    act(() => tree.update(render('celebrate', cheer)));
    act(() => jest.advanceTimersByTime(CLIP_SWAP_TIMEOUT_MS));
    expect(layersOf(tree).map(({ hevc }) => hevc)).toEqual([2]);
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('treats a new form on the same animation as a new clip', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(render('idle', idle));
    });
    act(() => tree.update(render('idle', { hevc: 3, loop: true })));
    expect(layersOf(tree).map(({ hevc }) => hevc)).toEqual([1, 3]);
    act(() => tree.unmount());
  });
});
