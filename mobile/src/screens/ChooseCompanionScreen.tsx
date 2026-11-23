import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ROOM_THEMES, type PetBreed, type PetForm, type PetState, type RoomTheme } from '@vitto/core';
import Svg, { Circle, Path } from 'react-native-svg';
import { CoinMark } from '../components/CoinMark';
import { EvolutionCard } from '../components/EvolutionCard';
import { logHaptic } from '../components/logKit';
import { PET_SHEETS, portraitFrame, sheetByBreed } from '../components/petSprites';
import { SpriteFrame } from '../components/SpriteFrame';
import { CloseButton, Mark, PressableScale, PrimaryButton, TextButton, haptic } from '../components/ui';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, fonts, layout, text, themedStyles } from '../theme';
import { SETTINGS_MAX_WIDTH, SegmentedControl } from '../components/settingsKit';
import { ROOM_THEME_DETAIL, ROOM_THEME_LABEL, ROOM_THEME_NIGHT_PREVIEWS, ROOM_THEME_PREVIEWS } from '../petWorld/roomTheme';
import { isNightTime } from '../petWorld/timeOfDay';

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

const NATIVE_DRIVER = Platform.OS !== 'web';
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;
/** How long "Equipped!" stays up: long enough to read, gone before it is in the way. */
const DONE_MS = 3500;
/** Room for the confirm sheet, so the last row can still scroll clear of it. */
const SHEET_ROOM = 230;

/** The order ROOM_THEME_PREVIEWS draws each theme's rooms in. */
const ROOM_NAMES = ['Living room', 'Kitchen', 'Gym', 'Study', 'Outside'] as const;
/**
 * The hero's height for its width. A little under square: the living room is
 * 2:3 and the others 3:5, so this keeps each room's middle (where the pet and
 * the furniture are) and loses only sky and floor.
 */
const HERO_RATIO = 0.9;

/**
 * A spring from a little small to full size, once, when `active` is first
 * true: the beat that says "this just happened". With Reduce Motion it is
 * simply there.
 */
function usePop(active: boolean) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(active ? 0.6 : 1)).current;
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: NATIVE_DRIVER }).start();
  }, [active, reduced, scale]);
  return { transform: [{ scale }] };
}

/** A price, with the coin: what it costs is the one thing a locked item says. */
function PriceTag({ amount, dim }: { amount: number; dim?: boolean }) {
  return (
    <View style={[styles.tag, styles.priceTag, dim && styles.priceTagDim]}>
      <CoinMark size={14} />
      <Text style={[styles.priceText, dim && styles.priceTextDim]} numberOfLines={1}>{`${amount} coins`}</Text>
    </View>
  );
}

/** What an item already is to the pet: worn now, or kept to go back to for free. */
function StateTag({ kind, pop = false }: { kind: 'equipped' | 'owned'; pop?: boolean }) {
  const popStyle = usePop(pop);
  if (kind === 'owned') {
    return (
      <View style={[styles.tag, styles.ownedTag]}>
        <Text style={styles.ownedText} numberOfLines={1}>
          Owned · free
        </Text>
      </View>
    );
  }
  return (
    <Animated.View style={[styles.tag, styles.equippedTag, popStyle]}>
      <Mark kind="check" size={11} color={colors.coralDeep} weight={2.2} />
      <Text style={styles.equippedText} numberOfLines={1}>
        Equipped
      </Text>
    </Animated.View>
  );
}

/**
 * How far off the next buy is, said once above the items rather than on every
 * locked one, with a bar of the coins already saved toward it.
 */
function ShortNote({ have, need, children, testID }: { have: number; need: number; children: string; testID: string }) {
  const share = need > 0 ? Math.max(0, Math.min(1, have / need)) : 0;
  return (
    <View style={styles.short}>
      <View style={styles.shortHead}>
        <Text style={styles.shortFigure} numberOfLines={1}>
          {have}
        </Text>
        <Text style={styles.shortOf} numberOfLines={1}>{`/ ${need}`}</Text>
        <CoinMark size={14} />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${share * 100}%` as const }]} />
      </View>
      <Text style={styles.shortText} testID={testID}>
        {children}
      </Text>
    </View>
  );
}

/** The balance, always in the header: what every price on the page is measured against. */
function CoinPill({ coins }: { coins: number }) {
  // A small bounce when the balance moves (a purchase landing), so the spend is felt.
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const last = useRef(coins);
  useEffect(() => {
    if (last.current === coins) return;
    last.current = coins;
    if (reduced) return;
    scale.setValue(1.15);
    Animated.spring(scale, { toValue: 1, speed: 12, bounciness: 10, useNativeDriver: NATIVE_DRIVER }).start();
  }, [coins, reduced, scale]);
  return (
    <Animated.View style={[styles.coinPill, { transform: [{ scale }] }]} accessibilityLabel={`${coins} coins`} accessible>
      <CoinMark size={18} />
      <Text style={styles.coinValue} numberOfLines={1}>
        {coins}
      </Text>
    </Animated.View>
  );
}

/**
 * One animal, its sprite large on a warm tile. Locked ones fade only the
 * picture, so the name and price stay readable (as BreedPicker learned).
 */
function AnimalTile({
  sheet,
  selected,
  equipped,
  owned,
  locked,
  price,
  pop,
  onPress,
}: {
  sheet: (typeof PET_SHEETS)[number];
  selected: boolean;
  equipped: boolean;
  owned: boolean;
  locked: boolean;
  price: number;
  pop: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: locked }}
      accessibilityLabel={`Choose the ${sheet.label}`}
      disabled={locked}
      onPress={onPress}
      scaleTo={0.96}
      style={[styles.animal, selected && styles.selected]}
      testID={`breed-${sheet.name}`}
    >
      <View style={[styles.animalArt, selected && styles.animalArtOn]}>
        <View style={locked && styles.faded}>
          <SpriteFrame sheet={sheet} frame={portraitFrame(sheet)} size={ANIMAL_SPRITE} />
        </View>
      </View>
      <Text style={[styles.animalName, selected && styles.nameOn]} numberOfLines={1}>
        {sheet.label}
      </Text>
      {equipped ? (
        <StateTag kind="equipped" pop={pop} />
      ) : owned ? (
        <StateTag kind="owned" />
      ) : price > 0 ? (
        <PriceTag amount={price} dim={locked} />
      ) : (
        <View style={[styles.tag, styles.ownedTag]}>
          <Text style={styles.ownedText} numberOfLines={1}>Free</Text>
        </View>
      )}
    </PressableScale>
  );
}

const ANIMAL_SPRITE = 104;

/**
 * A theme's rooms, one at a time and large: the living room first, the other
 * four a swipe away, with dots for where you are.
 *
 * Every image is sized from the measured width rather than a style
 * `aspectRatio`: react-native-web does not constrain an image that way, so on
 * web each one grew to its full natural height (see EnvironmentBackdrop,
 * which hit the same thing). The frame itself can take an aspect ratio, so the
 * card holds its shape before the art arrives.
 */
function RoomHero({ theme, faded, badge, onPress, disabled }: { theme: RoomTheme; faded: boolean; badge?: ReactNode; onPress?: () => void; disabled?: boolean }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  // Day or night art, per card; starts on whatever the rooms look like right now.
  const [night, setNight] = useState(isNightTime);
  const sources = (night ? ROOM_THEME_NIGHT_PREVIEWS : ROOM_THEME_PREVIEWS)[theme];
  const height = Math.round(width * HERO_RATIO);
  return (
    <View
      style={styles.hero}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setWidth((current) => (current === next ? current : next));
      }}
    >
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / width);
            setPage((current) => (current === next ? current : next));
          }}
          style={faded && styles.heroFaded}
          accessibilityLabel={`${ROOM_THEME_LABEL[theme]} rooms, showing the ${ROOM_NAMES[page]?.toLowerCase() ?? 'living room'}`}
        >
          {/* Each picture is its own tap target inside the scroller, the usual
              carousel shape: a swipe scrolls and cancels the tap. Wrapped the
              other way round (the whole card one button around the scroller)
              the button kept the touch and the pictures would not swipe. */}
          {sources.map((source, index) => (
            <Pressable key={index} onPress={onPress} disabled={disabled} accessible={false}>
              <Image source={source} style={{ width, height }} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={night ? `Show the ${ROOM_THEME_LABEL[theme]} rooms by day` : `Show the ${ROOM_THEME_LABEL[theme]} rooms at night`}
        onPress={() => {
          haptic('select');
          setNight((current) => !current);
        }}
        hitSlop={6}
        scaleTo={0.92}
        style={styles.lightToggle}
        testID={`room-light-${theme}`}
      >
        <View style={styles.dotsScrim} />
        <LightGlyph night={night} />
      </PressableScale>
      {badge ? (
        <View style={styles.heroBadge} pointerEvents="none">
          {badge}
        </View>
      ) : null}
      <View style={styles.dots} pointerEvents="none">
        <View style={styles.dotsScrim} />
        {sources.map((_, index) => (
          <View key={index} style={[styles.dot, index === page && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

/** The day/night toggle's glyph: a sun by day, a moon at night (what is showing). */
function LightGlyph({ night }: { night: boolean }) {
  const ink = colors.onCoral;
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
      {night ? (
        <Path d="M20 14.5 A8 8 0 1 1 9.5 4 A6.5 6.5 0 0 0 20 14.5 Z" stroke={ink} strokeWidth={2} strokeLinejoin="round" fill="none" />
      ) : (
        <>
          <Circle cx={12} cy={12} r={4} stroke={ink} strokeWidth={2} fill="none" />
          <Path
            d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5 M5.3 5.3 L6.7 6.7 M17.3 17.3 L18.7 18.7 M5.3 18.7 L6.7 17.3 M17.3 6.7 L18.7 5.3"
            stroke={ink}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}

/**
 * The confirm before a spend, pinned to the bottom so it is never a scroll
 * away from the item that asked for it: what it is, what it costs, what is
 * left, and one obvious button.
 */
function ConfirmSheet({
  testID,
  art,
  title,
  body,
  action,
  onConfirm,
  onCancel,
}: {
  testID: string;
  art: ReactNode;
  title: string;
  body: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(reduced ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(rise, { toValue: 0, speed: 16, bounciness: 4, useNativeDriver: NATIVE_DRIVER }).start();
  }, [rise]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  return (
    <Animated.View style={[styles.sheet, { paddingBottom: 12 + HOME_INDICATOR_INSET, transform: [{ translateY }] }]} testID={testID}>
      <View style={styles.sheetInner}>
        <View style={styles.sheetHead}>
          {art}
          <View style={styles.sheetCopy}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Text style={styles.sheetBody}>{body}</Text>
          </View>
        </View>
        <PrimaryButton label={action} onPress={onConfirm} />
        <View style={styles.sheetCancel}>
          <TextButton label="Not now" onPress={onCancel} />
        </View>
      </View>
    </Animated.View>
  );
}

/** The payoff once a buy or a switch has really landed: a check and a line, then it goes. */
function DoneToast({ message }: { message: string }) {
  const pop = usePop(true);
  return (
    <View style={styles.toastWrap} pointerEvents="none">
      <Animated.View style={[styles.toast, pop]} accessibilityLiveRegion="polite" testID="breed-switched">
        <View style={styles.toastCheck}>
          <Mark kind="check" size={14} color={colors.card} weight={2.4} />
        </View>
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>
    </View>
  );
}

/**
 * The pet's collection, on a page of its own (from Settings, or the coins in
 * the room): the animals it owns and the ones it could, then its forms. Every
 * animal bought is kept, so going back to one is free and happens on the tap;
 * the pet stays the same pet (name, level, stats, coins) whichever it looks
 * like. A new animal costs coins: without enough, the ones not owned are
 * greyed out and the page says how far off it is. With enough, a pick waits
 * for a confirm that names the price, so nothing is spent on a stray tap.
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
  // Which item just became the equipped one, so only its badge pops (not
  // whichever is equipped when the page opens).
  const [landed, setLanded] = useState<string | null>(null);
  useEffect(() => {
    if (!switching || breed !== switching.breed) return;
    const name = sheetByBreed(switching.breed).label;
    setDone(switching.bought ? `You got the ${name}! ${pet?.name ?? 'Your pet'} is wearing it now.` : `${pet?.name ?? 'Your pet'} is the ${name} again.`);
    setLanded(`breed:${switching.breed}`);
    setSwitching(null);
    logHaptic();
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
    setLanded(`room:${switchingTheme.theme}`);
    setSwitchingTheme(null);
    logHaptic();
  }, [roomTheme, switchingTheme, pet?.name]);

  // The line clears itself; the Equipped badge on the item is what stays.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);

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
    haptic('select');
    setDone(null);
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
    haptic('select');
    setDone(null);
    setPending(next);
  };

  const confirming = showRooms ? pendingTheme !== null : pending !== null;

  return (
    <View style={layout.screen}>
      <View style={styles.header}>
        {/* Flexed, so a long title at large text wraps instead of pushing the coins off. */}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Shop</Text>
        </View>
        {/* The balance stays in sight while everything scrolls. */}
        <CoinPill coins={coins} />
        <CloseButton onPress={onClose} />
      </View>

      {onChooseRoomTheme ? (
        <View style={styles.tabs}>
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
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET + (confirming ? SHEET_ROOM : 0) }]}
      >
        {showRooms ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Rooms</Text>
              <Text style={styles.sectionCount} numberOfLines={1}>{`${new Set(themesOwned).size} of ${ROOM_THEMES.length} owned`}</Text>
            </View>
            {!themeAffordable && themesOwned.length < ROOM_THEMES.length ? (
              <ShortNote have={coins} need={roomThemeCost} testID="room-coins-short">
                {`You need ${roomThemeCost - coins} more coins for new rooms. You earn 50 for every level-up.`}
              </ShortNote>
            ) : null}
            {ROOM_THEMES.map((theme) => {
              const current = theme === roomTheme;
              const selected = (pendingTheme ?? roomTheme) === theme;
              const themeOwned = themesOwned.includes(theme);
              const locked = !themeOwned && !themeAffordable;
              const note = current ? 'Equipped' : themeOwned ? 'Owned · free' : themeFree ? 'Free' : `${roomThemeCost} coins`;
              return (
                <View key={theme} style={[styles.theme, selected && styles.selected]}>
                  <RoomHero
                    theme={theme}
                    faded={locked}
                    badge={current ? <StateTag kind="equipped" pop={landed === `room:${theme}`} /> : undefined}
                    onPress={() => pickTheme(theme)}
                    disabled={locked}
                  />
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: locked }}
                    accessibilityLabel={`${ROOM_THEME_LABEL[theme]} rooms, ${note}`}
                    disabled={locked}
                    onPress={() => pickTheme(theme)}
                    scaleTo={0.985}
                    style={styles.themeText}
                    testID={`room-theme-${theme}`}
                  >
                    <View style={styles.themeCopy}>
                      <Text style={[styles.themeName, selected && styles.nameOn]}>{ROOM_THEME_LABEL[theme]}</Text>
                      <Text style={styles.themeDetail} numberOfLines={2}>
                        {ROOM_THEME_DETAIL[theme]}
                      </Text>
                    </View>
                    {current ? null : themeOwned ? (
                      <StateTag kind="owned" />
                    ) : themeFree ? (
                      <View style={[styles.tag, styles.ownedTag]}>
                        <Text style={styles.ownedText} numberOfLines={1}>Free</Text>
                      </View>
                    ) : (
                      <View style={styles.themePrice}>
                        <PriceTag amount={roomThemeCost} dim={locked} />
                        {locked ? <Text style={styles.needMore} numberOfLines={1}>{`${roomThemeCost - coins} more`}</Text> : null}
                      </View>
                    )}
                  </PressableScale>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Animals</Text>
              <Text style={styles.sectionCount} numberOfLines={1}>{`${ownedBreeds.length} of ${PET_SHEETS.length} owned`}</Text>
            </View>

            {!affordable ? (
              <ShortNote have={coins} need={cost} testID="coins-short">
                {`You need ${cost - coins} more coins for a new animal. You earn 50 for every level-up.`}
              </ShortNote>
            ) : null}

            <View style={styles.grid}>
              {PET_SHEETS.map((sheet) => {
                const owns = isOwned(sheet.name);
                return (
                  <AnimalTile
                    key={sheet.name}
                    sheet={sheet}
                    selected={(pending ?? breed) === sheet.name}
                    equipped={sheet.name === breed}
                    owned={owns}
                    locked={!affordable && !owns}
                    price={free ? 0 : cost}
                    pop={landed === `breed:${sheet.name}`}
                    onPress={() => pick(sheet.name)}
                  />
                );
              })}
            </View>

            {pet && onChooseForm ? <EvolutionCard pet={pet} onChooseForm={onChooseForm} /> : null}
          </>
        )}
      </ScrollView>

      {showRooms && pendingTheme ? (
        <ConfirmSheet
          testID="room-theme-confirm"
          art={<Image source={ROOM_THEME_PREVIEWS[pendingTheme][0]} style={styles.sheetArt} resizeMode="cover" />}
          title={`Get the ${ROOM_THEME_LABEL[pendingTheme]} rooms?`}
          body={`You'll have ${coins - roomThemeCost} left, and can switch back to any rooms you own for free.`}
          action={`Move in · ${roomThemeCost} coins`}
          onConfirm={() => {
            chooseTheme(pendingTheme, true);
            setPendingTheme(null);
          }}
          onCancel={() => setPendingTheme(null)}
        />
      ) : null}
      {!showRooms && pending ? (
        <ConfirmSheet
          testID="breed-switch-confirm"
          art={
            <View style={styles.sheetArt}>
              <SpriteFrame sheet={sheetByBreed(pending)} frame={portraitFrame(sheetByBreed(pending))} size={56} />
            </View>
          }
          title={`Get the ${sheetByBreed(pending).label}?`}
          body={`You'll have ${coins - cost} left, and keep every animal you own to switch back to.`}
          action={`Switch · ${cost} coins`}
          onConfirm={() => {
            choose(pending, true);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {done && !confirming ? <DoneToast key={done} message={done} /> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 4,
  },
  title: { ...text.title },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 17,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  coinValue: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], flexShrink: 0 },
  tabs: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 22, marginTop: 14 },
  // One readable column on a tablet, as Settings has; no change on a phone.
  body: { paddingHorizontal: 22, paddingTop: 18, gap: 14, width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { ...text.heading, fontSize: 20, fontWeight: '700' },
  sectionCount: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', color: colors.muted, fontVariant: ['tabular-nums'], flexShrink: 0 },

  short: { gap: 8, padding: 14, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.card },
  shortHead: { flexDirection: 'row', alignItems: 'center' },
  shortFigure: { fontFamily: fonts.ui, fontSize: 22, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], flexShrink: 0 },
  // A leading space in its own block is dropped on the web, so the gap is a margin.
  shortOf: { marginLeft: 4, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.faint, fontVariant: ['tabular-nums'], marginRight: 6, flexShrink: 0 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.track },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.coral },
  shortText: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, lineHeight: 18 },

  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderCurve: 'continuous',
  },
  priceTag: { backgroundColor: colors.yellow },
  priceTagDim: { backgroundColor: colors.cardSoft },
  priceText: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.yellowDeep, fontVariant: ['tabular-nums'], flexShrink: 0 },
  priceTextDim: { color: colors.muted },
  ownedTag: { backgroundColor: colors.mint },
  ownedText: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', color: colors.mintDeep, flexShrink: 0 },
  // The selected pair (wash and deep coral), so it reads in both schemes; on
  // a selected tile the pill melts into the wash and the tick and word carry it.
  equippedTag: { backgroundColor: colors.selectedFill },
  equippedText: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.coralDeep, flexShrink: 0 },

  // The picked item (or, with nothing picked, the one worn) takes the coral wash.
  selected: { backgroundColor: colors.selectedFill },
  nameOn: { color: colors.coralDeep },
  // Greyed right down: still recognisable, plainly not on offer yet.
  faded: { opacity: 0.38 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  animal: {
    // Two per row: room for a big sprite, and it wraps cleanly on a tablet.
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
    padding: 8,
    paddingBottom: 12,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  animalArt: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.tile,
  },
  animalArtOn: { backgroundColor: colors.coralWash },
  animalName: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.ink },

  theme: { padding: 8, paddingBottom: 14, gap: 12, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.card },
  hero: {
    alignSelf: 'stretch',
    aspectRatio: 1 / HERO_RATIO,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.tile,
  },
  // Less faded than a locked animal: the art is what sells a theme, so it stays easy to see.
  heroFaded: { opacity: 0.55 },
  heroBadge: { position: 'absolute', top: 10, right: 10 },
  // Top left, opposite the Equipped badge: on the same dark scrim as the dots.
  lightToggle: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dots over the art, on a dark scrim so they read on any room's colours.
  // The art is the same in both schemes, so the dots are the warm white that
  // sits on coral (`onCoral`, fixed in both), not a text colour that flips.
  dots: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dotsScrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.shadow, opacity: 0.4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.onCoral, opacity: 0.5 },
  dotOn: { width: 16, opacity: 1 },
  themeText: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 8 },
  themeCopy: { flex: 1, gap: 2 },
  themeName: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 17, color: colors.ink },
  themeDetail: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, lineHeight: 18 },
  themePrice: { alignItems: 'flex-end', gap: 3 },
  needMore: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '600', color: colors.faint, fontVariant: ['tabular-nums'], flexShrink: 0 },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  sheetInner: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center', gap: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetArt: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.tile,
  },
  sheetCopy: { flex: 1, gap: 3 },
  sheetTitle: { ...text.heading, fontWeight: '700' },
  sheetBody: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted, lineHeight: 19 },
  sheetCancel: { alignItems: 'center' },

  toastWrap: { position: 'absolute', left: 22, right: 22, bottom: 16 + HOME_INDICATOR_INSET, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: SETTINGS_MAX_WIDTH,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastCheck: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintDeep },
  // minWidth: on web a long unbroken pet name wraps inside the toast, not past it.
  toastText: { flex: 1, minWidth: 0, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.ink, lineHeight: 20 },
}));
