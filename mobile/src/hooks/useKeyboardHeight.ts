import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How much of the screen the keyboard covers right now, 0 while it is down.
 *
 * For an overlay drawn with `position: absolute`: a KeyboardAvoidingView's
 * padding moves its laid-out children but not an absolute one pinned to its
 * bottom, so a button at the foot of such an overlay ends up under the keys.
 * The overlay pads itself by this instead. iOS only: Android resizes the window.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const show = Keyboard.addListener('keyboardWillShow', (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
