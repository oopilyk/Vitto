import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PetMicButton } from '../petWorld/PetMicButton';

const speech = jest.requireMock('expo-speech-recognition') as {
  ExpoSpeechRecognitionModule: Record<'start' | 'stop' | 'requestPermissionsAsync' | 'getPermissionsAsync', jest.Mock>;
  __emit: (name: string, event?: unknown) => void;
};

const mount = (onSay: (text: string) => void) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PetMicButton petName="Nugget" onSay={onSay} size={44} />);
  });
  return tree;
};
const button = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.testID === 'pet-mic' && typeof node.props.onPressIn === 'function')[0]!;
const caption = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAll((node) => node.props.testID === 'mic-caption')[0]
    ?.findAllByType(Text)
    .map((node) => String(node.props.children))
    .join(' ') ?? '';

describe('talking to the pet', () => {
  // Fake timers: the hold is timed off the clock, and the listening pulse
  // must not run for real.
  const later = (ms: number) => jest.setSystemTime(Date.now() + ms);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('only asks for permission on the first press, without listening yet', async () => {
    // First on purpose: once granted, the permission is remembered for the session.
    speech.ExpoSpeechRecognitionModule.getPermissionsAsync.mockResolvedValue({ granted: false });
    speech.ExpoSpeechRecognitionModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    const tree = mount(() => {});
    await act(async () => {
      await button(tree).props.onPressIn();
    });
    expect(speech.ExpoSpeechRecognitionModule.requestPermissionsAsync).toHaveBeenCalled();
    expect(speech.ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(caption(tree)).toContain('Now hold the button and talk');
    speech.ExpoSpeechRecognitionModule.getPermissionsAsync.mockResolvedValue({ granted: true });
    tree.unmount();
  });

  it('listens while held, shows what it heard, and sends it on letting go', async () => {
    const said: string[] = [];
    const tree = mount((text) => said.push(text));
    await act(async () => {
      await button(tree).props.onPressIn();
    });
    expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(expect.objectContaining({ interimResults: true, requiresOnDeviceRecognition: true }));
    // Until iOS has the mic recording, it says to wait rather than to talk.
    expect(caption(tree)).toContain('One sec');
    act(() => speech.__emit('audiostart', {}));
    expect(caption(tree)).toContain('Listening');

    act(() => speech.__emit('result', { results: [{ transcript: 'did you miss me' }], isFinal: false }));
    expect(caption(tree)).toContain('did you miss me');

    later(2000);
    act(() => button(tree).props.onPressOut());
    expect(speech.ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();
    act(() => speech.__emit('end'));
    expect(said).toEqual(['did you miss me']);
    tree.unmount();
  });

  it('treats a quick tap as a question about how it works, and sends nothing', async () => {
    const said: string[] = [];
    const tree = mount((text) => said.push(text));
    await act(async () => {
      await button(tree).props.onPressIn();
    });
    later(100);
    act(() => button(tree).props.onPressOut());
    act(() => speech.__emit('end'));
    expect(said).toEqual([]);
    expect(caption(tree)).toContain('Hold to talk');
    tree.unmount();
  });

});
