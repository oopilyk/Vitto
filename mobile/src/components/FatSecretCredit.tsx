import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts, themedStyles } from '../theme';

/** Where FatSecret's attribution policy says the credit must link. */
export const FATSECRET_URL = 'https://platform.fatsecret.com';

/**
 * FatSecret's required credit. Its terms say every place its food data is
 * shown carries this link, worded exactly so (the policy forbids changing the
 * snippet), and that one is visible before signing in; see the food search and
 * scan results, and the welcome screen.
 */
export function FatSecretCredit({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text
      style={[styles.credit, style]}
      accessibilityRole="link"
      onPress={() => void Linking.openURL(FATSECRET_URL)}
    >
      Powered by fatsecret Platform API
    </Text>
  );
}

const styles = themedStyles(() => ({
  credit: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: colors.faint,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 10,
  },
}));
