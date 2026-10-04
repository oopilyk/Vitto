import { ScrollView } from 'react-native';
import { PAYWALL_BOTTOM_INSET, PlusPaywall } from '../components/PlusPaywall';
import { layout, themedStyles } from '../theme';

interface Props {
  /** The dev account is Plus whatever the store says; the paywall says so instead of selling it. */
  isDevAccount?: boolean;
  /** Called with the new tier after a purchase, restore or cancel, so the app unlocks at once. */
  onTierChange: (tier: 'free' | 'plus') => void;
  /** After a successful purchase (not a restore). */
  onPurchased?: () => void;
  onClose: () => void;
}

/**
 * Vitto Plus as a screen of its own, from Settings and the chat's daily limit.
 * The same paywall onboarding shows at its third step (see PlusPaywall).
 */
export function PlusScreen({ isDevAccount, onTierChange, onPurchased, onClose }: Props) {
  return (
    <ScrollView style={layout.screen} contentContainerStyle={[styles.body, { paddingBottom: 40 + PAYWALL_BOTTOM_INSET }]}>
      <PlusPaywall isDevAccount={isDevAccount} onTierChange={onTierChange} onPurchased={onPurchased} onClose={onClose} />
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  body: { paddingHorizontal: 16, paddingTop: 62 },
}));
