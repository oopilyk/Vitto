import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { PetVideo } from '../components/PetVideo';

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
