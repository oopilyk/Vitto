import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ROOM_THEMES, type PetBreed, type PetForm, type PetState, type RoomTheme } from '@vitto/core';
import { BreedPicker } from '../components/BreedPicker';
import { EvolutionCard } from '../components/EvolutionCard';
import { sheetByBreed } from '../components/petSprites';
import { Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text, themedStyles } from '../theme';
import { SETTINGS_MAX_WIDTH, SegmentedControl } from '../components/settingsKit';
import { ROOM_THEME_DETAIL, ROOM_THEME_LABEL, ROOM_THEME_PREVIEWS } from '../petWorld/roomTheme';

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
  /**
   * With `onChooseRoomTheme`, a Rooms tab: the themes the pet's rooms can be
   * drawn in, bought with the same coins and kept the same way as animals.
   */
  roomTheme?: RoomTheme;
  /** Every theme the pet owns (`ownedRoomThemesOf`); switching back to one is free. */
  ownedRoomThemes?: readonly RoomTheme[];
  /** What a new theme costs; 0 (the dev account) switches on the tap. */
  roomThemeCost?: number;
  onChooseRoomTheme?: (theme: RoomTheme) => void;
}

type Tab = 'animals' | 'rooms';

const PREVIEW_GAP = 6;

/**
 * A theme's rooms side by side, each a 3:4 crop of its art.
 *
 * Sized from the strip's measured width rather than a style `aspectRatio`:
 * react-native-web does not constrain an image that way, so on web each one
 * grew to its full natural height in uneven columns (see EnvironmentBackdrop,
 * which hit the same thing).
 */
function RoomPreviewStrip({ theme, faded }: { theme: RoomTheme; faded: boolean }) {
  const [width, setWidth] = useState(0);
  const sources = ROOM_THEME_PREVIEWS[theme];
  const roomWidth = width > 0 ? (width - PREVIEW_GAP * (sources.length - 1)) / sources.length : 0;
  const roomHeight = roomWidth * (4 / 3);
  return (
    <View
      style={[styles.themeArt, faded && styles.themeLocked, { height: roomHeight }]}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setWidth((current) => (current === next ? current : next));
      }}
    >
      {roomWidth > 0
        ? sources.map((source, index) => (
            <Image
              key={index}
              source={source}
              style={[styles.themeRoom, { width: roomWidth, height: roomHeight }]}
              resizeMode="cover"
            />
          ))
        : null}
    </View>
  );
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
 *
 * A second tab sells room themes the same way: bought once with the pet's
 * coins, then free to switch between.
 */
export function ChooseCompanionScreen({
  breed,
  owned,
  coins,
  cost,
  onChoose,
  onClose,
  pet,
  onChooseForm,
  roomTheme = 'classic',
  ownedRoomThemes,
  roomThemeCost = 0,
  onChooseRoomTheme,
}: Props) {
  const [tab, setTab] = useState<Tab>('animals');
  const [pending, setPending] = useState<PetBreed | null>(null);
  const free = cost <= 0;
  const affordable = free || coins >= cost;
  const ownedBreeds: readonly PetBreed[] = owned ?? (breed ? [breed] : []);
  const isOwned = (option: PetBreed) => ownedBreeds.includes(option);

  // The page stays open after a switch, so trying animals on is quick; what
  // just happened is said once the pet really is the new animal (the parent
  // saves it, and a refused buy puts the old one back).
  const [switching, setSwitching] = useState<{ breed: PetBreed; bought: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!switching || breed !== switching.breed) return;
    const name = sheetByBreed(switching.breed).label;
    setDone(switching.bought ? `You got the ${name}! ${pet?.name ?? 'Your pet'} is wearing it now.` : `${pet?.name ?? 'Your pet'} is the ${name} again.`);
    setSwitching(null);
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [breed, switching, pet?.name]);

  // The same for rooms: said once the pet's rooms really are the new theme.
  const [pendingTheme, setPendingTheme] = useState<RoomTheme | null>(null);
  const [switchingTheme, setSwitchingTheme] = useState<{ theme: RoomTheme; bought: boolean } | null>(null);
  const themesOwned: readonly RoomTheme[] = ownedRoomThemes ?? ['classic', roomTheme];
  const themeFree = roomThemeCost <= 0;
  const themeAffordable = themeFree || coins >= roomThemeCost;
  useEffect(() => {
    if (!switchingTheme || roomTheme !== switchingTheme.theme) return;
    const name = ROOM_THEME_LABEL[switchingTheme.theme];
    const who = pet?.name ?? 'Your pet';
    setDone(switchingTheme.bought ? `The ${name} rooms are yours! ${who} has moved in.` : `${who} is back in the ${name} rooms.`);
    setSwitchingTheme(null);
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [roomTheme, switchingTheme, pet?.name]);

  const chooseTheme = (next: RoomTheme, bought: boolean) => {
    setDone(null);
    setSwitchingTheme({ theme: next, bought });
    onChooseRoomTheme?.(next);
  };

  const pickTheme = (next: RoomTheme) => {
    if (next === roomTheme) {
      setPendingTheme(null);
      return;
    }
    if (themeFree || themesOwned.includes(next)) {
      setPendingTheme(null);
      // Free on the dev account is still a first move in, not a move back.
      chooseTheme(next, !themesOwned.includes(next));
      return;
    }
    setPendingTheme(next);
  };

  const showRooms = Boolean(onChooseRoomTheme) && tab === 'rooms';

  const choose = (next: PetBreed, bought: boolean) => {
    setDone(null);
    setSwitching({ breed: next, bought });
    onChoose(next);
  };

  const pick = (next: PetBreed) => {
    if (next === breed) {
      setPending(null);
      return;
    }
    if (free || isOwned(next)) {
      setPending(null);
      choose(next, false);
      return;
    }
    setPending(next);
  };

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Your companion</Text>
        {/* The balance stays in sight while the animals scroll. */}
        <View style={[styles.back, styles.topCoins]} accessibilityLabel={`${coins} coins`}>
          <Text style={styles.topCoinsValue}>{coins}</Text>
          <Text style={styles.topCoinsLabel}>coins</Text>
        </View>
      </View>
      {done ? (
        <View style={styles.done} accessibilityLiveRegion="polite" testID="breed-switched">
          <Text style={styles.doneText}>{done}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}>
        <View style={styles.wallet} testID="coin-wallet">
          <View>
            <Text style={styles.walletLabel}>Your coins</Text>
            <Text style={styles.walletValue}>{coins}</Text>
          </View>
          <View style={styles.walletRight}>
            <Text style={styles.walletLabel}>{showRooms ? 'New rooms' : 'A new animal'}</Text>
            <Text style={styles.walletCost}>
              {showRooms ? (themeFree ? 'Free' : roomThemeCost) : free ? 'Free' : cost}
            </Text>
          </View>
        </View>

        {onChooseRoomTheme ? (
          <SegmentedControl
            options={[
              { value: 'animals' as const, label: 'Animals' },
              { value: 'rooms' as const, label: 'Rooms' },
            ]}
            value={tab}
            onChange={(next) => {
              setTab(next);
              setPending(null);
              setPendingTheme(null);
            }}
          />
        ) : null}

        {showRooms ? (
          <>
            <Kicker>Rooms</Kicker>
            <Text style={styles.hint}>
              {`Every room your pet lives in. Switching back to rooms you own is free.`}
            </Text>
            {!themeAffordable && themesOwned.length < ROOM_THEMES.length ? (
              <Text style={styles.short} testID="room-coins-short">
                {`You need ${roomThemeCost - coins} more coins for new rooms. You earn 50 for every level-up.`}
              </Text>
            ) : null}
            {ROOM_THEMES.map((theme) => {
              const current = theme === roomTheme;
              const selected = (pendingTheme ?? roomTheme) === theme;
              const isOwned = themesOwned.includes(theme);
              const locked = !isOwned && !themeAffordable;
              const note = current ? 'Current' : isOwned ? 'Owned · free' : themeFree ? 'Free' : `${roomThemeCost} coins`;
              return (
                <Pressable
                  key={theme}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: locked }}
                  accessibilityLabel={`${ROOM_THEME_LABEL[theme]} rooms, ${note}`}
                  disabled={locked}
                  onPress={() => pickTheme(theme)}
                  style={[styles.theme, selected && styles.themeOn]}
                  testID={`room-theme-${theme}`}
                >
                  <RoomPreviewStrip theme={theme} faded={locked} />
                  <View style={styles.themeText}>
                    <View style={styles.themeCopy}>
                      <Text style={[styles.themeName, selected && styles.themeNameOn]}>{ROOM_THEME_LABEL[theme]}</Text>
                      <Text style={styles.themeDetail}>{ROOM_THEME_DETAIL[theme]}</Text>
                    </View>
                    <Text style={[styles.themeNote, isOwned && styles.themeNoteOwned]}>{note}</Text>
                  </View>
                </Pressable>
              );
            })}
            {pendingTheme ? (
              <View style={styles.confirm} testID="room-theme-confirm">
                <Text style={styles.confirmText}>
                  {`Get the ${ROOM_THEME_LABEL[pendingTheme]} rooms for ${roomThemeCost} coins? You'll have ${coins - roomThemeCost} left, and can switch back to any rooms you own for free.`}
                </Text>
                <PrimaryButton
                  label={`Move in · ${roomThemeCost} coins`}
                  onPress={() => {
                    chooseTheme(pendingTheme, true);
                    setPendingTheme(null);
                  }}
                />
                <TextButton label="Stay where they are" onPress={() => setPendingTheme(null)} />
              </View>
            ) : null}
          </>
        ) : (
          <>
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
                    choose(pending, true);
                    setPending(null);
                  }}
                />
                <TextButton label="Keep them as they are" onPress={() => setPending(null)} />
              </View>
            ) : null}

            {pet && onChooseForm ? <EvolutionCard pet={pet} onChooseForm={onChooseForm} /> : null}
          </>
        )}
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
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 64 },
  backMark: { fontFamily: fonts.ui, fontSize: 34, lineHeight: 36, marginTop: -4, color: colors.coral },
  backLabel: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral },
  topTitle: { ...text.heading, fontSize: 21 },
  // One readable column on a tablet, as Settings has; no change on a phone.
  body: { padding: 16, gap: 12, width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  wallet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 16,
  },
  walletRight: { alignItems: 'flex-end' },
  walletLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.faint },
  walletValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 28, color: colors.yellowDeep, marginTop: 2 },
  walletCost: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 22, color: colors.ink, marginTop: 2 },
  hint: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, lineHeight: 18 },
  short: { ...text.body, color: colors.inkSoft, textAlign: 'center' },
  topCoins: { justifyContent: 'flex-end', alignItems: 'baseline', gap: 4 },
  topCoinsValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.yellowDeep },
  topCoinsLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint },
  done: { marginHorizontal: 16, marginBottom: 4, padding: 12, borderRadius: 12, backgroundColor: colors.mint },
  doneText: { ...text.body, color: colors.mintDeep, textAlign: 'center' },
  confirm: { gap: 8, marginTop: 4 },
  confirmText: { ...text.body, color: colors.inkSoft, textAlign: 'center' },
  theme: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
  },
  themeOn: { borderColor: colors.coral, backgroundColor: colors.selectedFill },
  themeArt: { flexDirection: 'row', gap: PREVIEW_GAP, alignSelf: 'stretch' },
  // Greyed like a locked animal: still recognisable, plainly not on offer.
  themeLocked: { opacity: 0.38 },
  themeRoom: { borderRadius: 8, overflow: 'hidden', backgroundColor: colors.paper },
  themeText: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  themeCopy: { flex: 1, gap: 2 },
  themeName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 16, color: colors.ink },
  themeNameOn: { color: colors.coralDeep },
  themeDetail: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, lineHeight: 18 },
  themeNote: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  themeNoteOwned: { color: colors.mintDeep },
}));
