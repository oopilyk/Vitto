import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { HealthEvent, PetState } from '@vitto/core';
import { PetShareCard } from '../components/PetShareCard';
import { sharePetCard } from '../services/shareCard';
import { Kicker } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

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

  const share = async () => {
    setBusy(true);
    setError(null);
    const outcome = await sharePetCard(card, pet.name);
    if (outcome === 'unavailable') setError('Sharing is not available on this device.');
    if (outcome === 'failed') setError(`Could not make ${pet.name}'s card. Try again.`);
    setBusy(false);
  };

  return (
    <View style={[layout.screen, styles.screen]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={10} style={styles.back}>
          <Text style={styles.backLabel}>←</Text>
          <Text style={styles.backText}>Pet</Text>
        </Pressable>
        <Text style={styles.title}>Share</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.stage}>
          <PetShareCard ref={card} pet={pet} events={events} onReady={() => setReady(true)} />
          {!ready ? (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator color={colors.coral} />
            </View>
          ) : null}
        </View>

        <Kicker>What gets sent</Kicker>
        <Text style={styles.note}>
          {`${pet.name} as a picture, with whatever they have to say today. Send it in Messages, or choose Save Image to keep it.`}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy }}
          disabled={!ready || busy}
          onPress={() => void share()}
          style={({ pressed }) => [styles.action, (!ready || busy) && styles.actionOff, pressed && styles.pressed]}
        >
          <Text style={styles.actionLabel}>{busy ? 'Getting it ready…' : `Share ${pet.name}`}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backLabel: { fontSize: 20, color: colors.coral },
  backText: { fontFamily: fonts.mono, fontSize: 13, color: colors.coral },
  title: { ...text.heading },
  body: { padding: 20, gap: 14, alignItems: 'stretch', paddingBottom: 48 },
  stage: { alignItems: 'center', marginBottom: 6 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  error: { fontSize: 13, color: colors.danger },
  action: { marginTop: 4, paddingVertical: 14, alignItems: 'center', borderRadius: 14, backgroundColor: colors.coral },
  actionOff: { opacity: 0.4 },
  actionLabel: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.85 },
});
