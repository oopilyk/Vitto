import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PetBreed } from '@vitto/core';
import { BreedPicker } from '../components/BreedPicker';
import { sheetByBreed } from '../components/petSprites';
import { PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  /** The animal the pet is now. */
  breed?: PetBreed;
  coins: number;
  /** What a switch costs; 0 (the dev account) switches on the tap. */
  cost: number;
  /** Switches and spends; the parent persists (see App's changeBreed). */
  onChoose: (breed: PetBreed) => void;
  onClose: () => void;
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/**
 * Switching the pet's animal, on a page of its own (from Settings). Switching
 * costs coins: without enough, every other animal is greyed out and cannot be
 * picked, and the page says how far off it is. With enough, a pick waits for a
 * confirm that names the price, so nothing is spent on a stray tap.
 */
export function ChooseCompanionScreen({ breed, coins, cost, onChoose, onClose }: Props) {
  const [pending, setPending] = useState<PetBreed | null>(null);
  const free = cost <= 0;
  const affordable = free || coins >= cost;

  const pick = (next: PetBreed) => {
    if (next === breed) {
      setPending(null);
      return;
    }
    if (free) {
      onChoose(next);
      onClose();
      return;
    }
    setPending(next);
  };

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Settings</Text>
        </Pressable>
        <Text style={styles.topTitle}>Your companion</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}>
        <View style={styles.wallet} testID="coin-wallet">
          <View>
            <Text style={styles.walletLabel}>Your coins</Text>
            <Text style={styles.walletValue}>{coins}</Text>
          </View>
          <View style={styles.walletRight}>
            <Text style={styles.walletLabel}>A switch costs</Text>
            <Text style={styles.walletCost}>{free ? 'Free' : cost}</Text>
          </View>
        </View>

        {!affordable ? (
          <Text style={styles.short} testID="coins-short">
            {`You need ${cost - coins} more coins to switch. You earn 50 for every level-up.`}
          </Text>
        ) : null}

        <BreedPicker
          value={pending ?? breed}
          current={breed}
          onChange={pick}
          size={84}
          locked={affordable ? undefined : (option) => option !== breed}
          lockedNote={affordable ? undefined : `${cost} coins`}
        />

        {pending ? (
          <View style={styles.confirm} testID="breed-switch-confirm">
            <Text style={styles.confirmText}>
              {`Switch to the ${sheetByBreed(pending).label} for ${cost} coins? You'll have ${coins - cost} left.`}
            </Text>
            <PrimaryButton
              label={`Switch · ${cost} coins`}
              onPress={() => {
                onChoose(pending);
                setPending(null);
                onClose();
              }}
            />
            <TextButton label="Keep them as they are" onPress={() => setPending(null)} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 12,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  topTitle: { ...text.heading, fontSize: 16 },
  body: { padding: 16, gap: 12 },
  wallet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    padding: 16,
  },
  walletRight: { alignItems: 'flex-end' },
  walletLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.faint },
  walletValue: { fontSize: 28, fontWeight: '800', color: colors.yellowDeep, marginTop: 2 },
  walletCost: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 2 },
  short: { ...text.body, color: colors.inkSoft, textAlign: 'center' },
  confirm: { gap: 8, marginTop: 4 },
  confirmText: { ...text.body, color: colors.inkSoft, textAlign: 'center' },
});
