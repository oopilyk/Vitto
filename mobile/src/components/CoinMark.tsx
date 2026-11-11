import { View } from 'react-native';
import { themedStyles } from '../theme';

/**
 * The coin, drawn flat in the pet world's style: a gold face, a dark rim and a
 * glint. One drawing for everywhere a coin shows (the HUD balance, the level-up
 * reward), so they always match.
 */
export function CoinMark({ size = 18 }: { size?: number }) {
  const rim = Math.max(2, Math.round(size / 9));
  return (
    <View style={[styles.coin, { width: size, height: size, borderRadius: size / 2, borderWidth: rim }]}>
      <View
        style={[
          styles.glint,
          { top: size * 0.11, left: size * 0.17, width: size * 0.22, height: size * 0.33, borderRadius: size * 0.11 },
        ]}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  coin: { borderColor: '#7a5a14', backgroundColor: '#e2b13c' },
  glint: { position: 'absolute', backgroundColor: '#f6dc8a' },
}));
