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
