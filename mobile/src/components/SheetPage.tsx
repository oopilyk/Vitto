import { type ReactNode, useEffect } from 'react';
import { BackHandler, type StyleProp, View, type ViewStyle } from 'react-native';

/**
 * The page of a screen the navigator already presents as a sheet
 * (`presentation: 'modal'` in App's root stack).
 *
 * These screens used to draw a React Native `Modal` of their own inside that
 * sheet: two sheets, one inside the other. Closing one took the inner sheet
 * away at once and left the outer, empty one on screen sliding down after it,
 * a blank page for a split second. The navigator's sheet is the only one now;
 * this is just its page.
 *
 * `onBackPress` is what Android's back button does here, which used to be the
 * Modal's `onRequestClose` (a game asking "leave?" rather than vanishing).
 */
export function SheetPage({
  children,
  onBackPress,
  style,
}: {
  children: ReactNode;
  onBackPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  useEffect(() => {
    if (!onBackPress) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackPress();
      return true;
    });
    return () => subscription.remove();
  }, [onBackPress]);
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}
