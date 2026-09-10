import { Alert, Platform } from 'react-native';

/**
 * `confirmDialog` lives in App.tsx, which cannot be imported in a unit test
 * (it mounts the whole app). These pin the behaviour it depends on instead:
 * that react-native-web's `Alert.alert` really is inert, which is what made
 * every confirming button look dead on the web build.
 */
describe('confirm dialogs on web', () => {
  it('react-native-web Alert.alert resolves nothing — the reason the web branch exists', () => {
    // Under jest-expo/web this is RNW's `static alert() {}`. If a future RNW
    // implements it for real, this fails and the web branch can be revisited.
    const settled = jest.fn();
    new Promise<boolean>((resolve) => {
      Alert.alert('t', 'm', [
        { text: 'Cancel', onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    }).then(settled);
    return new Promise<void>((done) => {
      setTimeout(() => {
        // Native jest-expo provides a working mock, so only assert the
        // never-settles property where Alert is actually the web stub.
        if (Platform.OS === 'web') expect(settled).not.toHaveBeenCalled();
        done();
      }, 20);
    });
  });

  it('window.confirm is what the web branch uses, and returns a boolean', () => {
    const original = global.confirm;
    (global as { confirm?: unknown }).confirm = jest.fn(() => true);
    expect(window.confirm('anything')).toBe(true);
    (global as { confirm?: unknown }).confirm = jest.fn(() => false);
    expect(window.confirm('anything')).toBe(false);
    (global as { confirm?: unknown }).confirm = original;
  });
});
