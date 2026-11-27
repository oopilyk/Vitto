import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { HealthEvent, PetState } from '@vitto/core';
import { PetShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '../components/PetShareCard';
import { sharePetCard } from '../services/shareCard';
import { Kicker } from '../components/ui';
import { t } from '../i18n';
import { colors, fonts, layout, text, themedStyles } from '../theme';

interface Props {
  pet: PetState;
  events: readonly HealthEvent[];
  onClose: () => void;
}

/**
 * Preview, then send. The card is rendered at its real size rather than a
 * thumbnail, because what is on screen here is literally what gets captured —
 * a preview that differed from the file would be the one bug nobody forgives in
 * a share flow.
 */
export function ShareCardScreen({ pet, events, onClose }: Props) {
  const card = useRef<View>(null);
  // Two images have to paint before a capture is anything but blank.
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The card is 330pt wide; a 320pt phone has 280pt inside the page's padding,
  // so there the preview is scaled down to fit. Only the preview: the capture
  // is of the card itself, at its real size.
  const fit = Math.min(1, (useWindowDimensions().width - 2 * PAGE_PADDING) / SHARE_CARD_WIDTH);

  const share = async () => {
    setBusy(true);
    setError(null);
    const outcome = await sharePetCard(card, pet.name);
    if (outcome === 'unavailable') setError(t('Sharing is not available on this device.'));
    if (outcome === 'failed') setError(t("Could not make {pet}'s card. Try again.", { pet: pet.name }));
    setBusy(false);
  };

  return (
    <View style={[layout.screen, styles.screen]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={onClose} hitSlop={10} style={styles.back}>
          <Text style={styles.backLabel}>‹</Text>
          <Text style={styles.backText}>{t('Pet')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('Share')}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.stage, fit < 1 && { height: SHARE_CARD_HEIGHT * fit }]}>
          <View style={fit < 1 ? { marginTop: (-SHARE_CARD_HEIGHT * (1 - fit)) / 2, transform: [{ scale: fit }] } : undefined}>
            <PetShareCard ref={card} pet={pet} events={events} onReady={() => setReady(true)} />
          </View>
          {!ready ? (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator color={colors.coral} />
            </View>
          ) : null}
        </View>

        <Kicker>{t('What gets sent')}</Kicker>
        <Text style={styles.note}>
          {t('{pet} as a picture, with whatever they have to say today. Send it in Messages, or choose Save Image to keep it.', { pet: pet.name })}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy }}
          disabled={!ready || busy}
          onPress={() => void share()}
          style={({ pressed }) => [styles.action, busy ? styles.actionBusy : !ready && styles.actionOff, pressed && styles.pressed]}
        >
          <Text style={[styles.actionLabel, !ready && !busy && styles.actionLabelOff]} numberOfLines={1}>{busy ? t('Getting it ready…') : t('Share {pet}', { pet: pet.name })}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const PAGE_PADDING = 20;

const styles = themedStyles(() => ({
  screen: { backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    // Clear of the status bar and the notch, like every other pushed screen.
    paddingTop: 58,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 64, minHeight: 44 },
  backLabel: { fontFamily: fonts.ui, fontSize: 34, lineHeight: 36, marginTop: -4, color: colors.coral },
  backText: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '500', color: colors.inkSoft },
  title: { ...text.heading },
  body: { padding: PAGE_PADDING, gap: 14, alignItems: 'stretch', paddingBottom: 48 },
  stage: { alignItems: 'center', marginBottom: 6 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  note: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  error: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },
  action: { marginTop: 4, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.coral },
  actionOff: { backgroundColor: colors.disabledFill },
  actionBusy: { opacity: 0.85 },
  actionLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.onCoral },
  actionLabelOff: { color: colors.onDisabled },
  pressed: { opacity: 0.85 },
}));
