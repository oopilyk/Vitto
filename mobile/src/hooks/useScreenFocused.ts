import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect, useState } from 'react';

/**
 * Whether the screen this is used in is the one on top. The main screen stays
 * mounted underneath whatever is pushed over it (Today, Settings, a chat), so
 * anything that animates there keeps running unseen unless it asks this.
 *
 * Outside a navigator (tests, previews) there is nothing on top: focused.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return undefined;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}
