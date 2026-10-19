import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { PetBreed, PetForm, PetState } from '@vitto/core';
import { BreedPicker } from '../components/BreedPicker';
import { EvolutionCard } from '../components/EvolutionCard';
import { sheetByBreed } from '../components/petSprites';
import { Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text, themedStyles } from '../theme';

interface Props {
  /** The animal the pet is now. */
  breed?: PetBreed;
  /** Every animal the pet owns (`ownedBreedsOf`); switching back to one is free. Defaults to just `breed`. */
  owned?: readonly PetBreed[];
  coins: number;
  /** What a new animal costs; 0 (the dev account) switches on the tap. */
  cost: number;
  /** Switches and spends; the parent persists (see App's changeBreed). */
  onChoose: (breed: PetBreed) => void;
  onClose: () => void;
  /** With both, the pet's forms are on this page too, as skins to wear. */
  pet?: PetState;
  onChooseForm?: (form: PetForm) => void;
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/**
 * The pet's collection, on a page of its own (from Settings): the animals it
 * owns and the ones it could, then its forms. Every animal bought is kept, so
 * going back to one is free and happens on the tap; the pet stays the same pet
 * (name, level, stats, coins) whichever it looks like. A new animal costs
 * coins: without enough, the ones not owned are greyed out and the page says
 * how far off it is. With enough, a pick waits for a confirm that names the
 * price, so nothing is spent on a stray tap.
 */
export function ChooseCompanionScreen({ breed, owned, coins, cost, onChoose, onClose, pet, onChooseForm }: Props) {
  const [pending, setPending] = useState<PetBreed | null>(null);
  const free = cost <= 0;
  const affordable = free || coins >= cost;
  const ownedBreeds: readonly PetBreed[] = owned ?? (breed ? [breed] : []);
  const isOwned = (option: PetBreed) => ownedBreeds.includes(option);

  const pick = (next: PetBreed) => {
    if (next === breed) {
      setPending(null);
      return;
    }
    if (free || isOwned(next)) {
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
            <Text style={styles.walletLabel}>A new animal</Text>
            <Text style={styles.walletCost}>{free ? 'Free' : cost}</Text>
          </View>
        </View>

        <Kicker>Animals</Kicker>
        <Text style={styles.hint}>
          {`${ownedBreeds.length} owned. Switching back to one you own is free, and ${pet?.name ?? 'your pet'} keeps everything else.`}
        </Text>

        {!affordable ? (
          <Text style={styles.short} testID="coins-short">
            {`You need ${cost - coins} more coins for a new animal. You earn 50 for every level-up.`}
          </Text>
        ) : null}

        <BreedPicker
          value={pending ?? breed}
          current={breed}
          onChange={pick}
          size={84}
          locked={affordable ? undefined : (option) => !isOwned(option)}
          owned={ownedBreeds}
          noteFor={(option) =>
            option === breed ? 'Current' : isOwned(option) ? 'Owned · free' : free ? 'Free' : `${cost} coins`
          }
        />

        {pending ? (
          <View style={styles.confirm} testID="breed-switch-confirm">
            <Text style={styles.confirmText}>
              {`Get the ${sheetByBreed(pending).label} for ${cost} coins? You'll have ${coins - cost} left, and keep every animal you own to switch back to.`}
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

        {pet && onChooseForm ? <EvolutionCard pet={pet} onChooseForm={onChooseForm} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => ({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 12,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backMark: { fontFamily: fonts.pixel, fontSize: 23, color: colors.coral },
  backLabel: { fontFamily: fonts.pixel, fontSize: 16, color: colors.muted },
  topTitle: { ...text.heading, fontSize: 21 },
  body: { padding: 16, gap: 12 },
  wallet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
    padding: 16,
  },
  walletRight: { alignItems: 'flex-end' },
  walletLabel: { fontFamily: fonts.pixel, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: colors.faint },
  walletValue: { fontFamily: fonts.pixelBold, fontSize: 36, color: colors.yellowDeep, marginTop: 2 },
  walletCost: { fontFamily: fonts.pixelBold, fontSize: 26, color: colors.ink, marginTop: 2 },
  hint: { fontFamily: fonts.pixel, fontSize: 16, color: colors.faint, lineHeight: 22 },
  short: { ...text.body, color: colors.inkSoft, textAlign: 'center' },
  confirm: { gap: 8, marginTop: 4 },
  confirmText: { ...text.body, color: colors.inkSoft, textAlign: 'center' },
}));
