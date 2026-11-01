// AsyncStorage's native module is absent under jest; its published mock stands in.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-video's native player is absent under jest. The stand-in keeps what a
// test can observe: which clip was asked for, and how it was set to play.
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    useVideoPlayer: (source, setup) => {
      const player = { source, loop: false, muted: false, audioMixingMode: 'auto', play: () => {}, pause: () => {} };
      setup?.(player);
      return player;
    },
    VideoView: (props) => require('react').createElement(View, { testID: 'pet-video', ...props }),
  };
});

// expo-audio's native player is absent under jest; the music stays silent.
jest.mock('expo-audio', () => ({
  setAudioModeAsync: () => Promise.resolve(),
  createAudioPlayer: () => ({ volume: 1, play: () => {}, pause: () => {}, replace: () => {}, addListener: () => ({ remove: () => {} }) }),
}));

// expo-speech-recognition's native recogniser is absent under jest. The stand-in
// records what was started and lets a test play events back through `__emit`.
jest.mock('expo-speech-recognition', () => {
  const React = require('react');
  const listeners = new Map();
  const module = {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  };
  return {
    ExpoSpeechRecognitionModule: module,
    useSpeechRecognitionEvent: (name, listener) => {
      const ref = React.useRef(listener);
      ref.current = listener;
      React.useEffect(() => {
        const call = (event) => ref.current(event);
        listeners.set(name, call);
        return () => listeners.delete(name);
      }, [name]);
    },
    __emit: (name, event) => listeners.get(name)?.(event),
  };
});
