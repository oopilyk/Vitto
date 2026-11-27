import { useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import {
  AILMENT_MESSAGE,
  bondFor,
  petVoice,
  type BondStage,
  type CareToast,
  type DayGoal,
  type HealthEvent,
  type PetState,
  calculateStreakStatus,
  daysWithPet,
  assessCondition,
  coinsOf,
  initialOf,
} from '@vitto/core';
import { FitText } from '../components/FitText';
import { fonts, world, themedStyles } from '../theme';
import { formatLocale, t, tn } from '../i18n';
import { CareToastBanner } from './CareToastBanner';
import { useReportHudEdge } from './RoomActionSlot';
import { useTourTarget } from '../tour/FirstRunTour';
import { navBarHeight } from './EnvironmentActionRow';
import { FROZEN_COLOR } from '../components/ActivityCalendar';
import { CoinMark } from '../components/CoinMark';
import { LevelRing } from './LevelRing';
import { canListen, PetMicButton } from './PetMicButton';
import { chromeScaleFor, topInsetFor } from './chromeScale';
import { RETRO_BORDER_WIDTH, retro, retroPressed } from './retroStyle';
import { WeighInPrompt, type WeighInPromptProps } from './WeighInPrompt';
import { ENVIRONMENT_LABEL, type EnvironmentId } from './types';

/** The product owner's own friends glyph, tinted per day/night at render time. */
const FRIENDS_ICON = require('../../assets/buttons/freinds_button.png');

/**
 * The chrome that isn't either scene, in the pet-world's pixel-UI language.
 * Three compact rows across the top, so the middle of the screen stays the
 * pet's and nothing grows down over it or the room's own buttons:
 *
 *   1. top bar  — the level ring (progression), one plate with the room over
 *                 the pet's name, and the account disc (Profile, Settings,
 *                 Friends).
 *   2. status   — the pet's own line, full width, and ONE row under it: the
 *                 streak, the bond when it has something to say, and what is
 *                 left of today as tokens.
 *   3. tools    — one row: the coin balance on the left, Chat and Today on
 *                 the right.
 *
 * It used to be busier: a "DAY 9 · WARM · 🔥2" line of its own between the
 * pet's line and the tokens, and Chat stacked under Today. A first look found
 * a dozen things to read before the pet; the day count told nobody anything,
 * and the rest now shares rows.
 *
 * With two pets the name plate in row 1 is the switch between them, marked by a
 * small triangle in its corner.
 *
 * The pet's condition is expressed as the pet's own line, not a badge; adding a
 * second joint pet lives in Profile's care-partner card, not here; and the full
 * stat sheet (buffs, ailments, every number) is one tap on the level ring away.
 */
interface PetWorldHudProps {
  pet: PetState;
  /** How much of today's goals are done, 0-100, shown on the TODAY button. */
  todayProgress?: number;
  /** What is left of today (calories, workout, steps), as tokens under the pet's line. */
  todayGoals?: DayGoal[];
  events: HealthEvent[];
  /**
   * Confirmation of the care moment just logged. Separate from `reaction`
   * because an ailment outranks that line, which left the user with no
   * acknowledgement at all whenever the pet happened to be unwell.
   */
  careToast?: CareToast | null;
  /** Which scene is on screen, named on the identity plate. */
  environment: EnvironmentId;
  /**
   * The room on screen is a page with the pet in a small window (RoomPanel):
   * the HUD stays off that window, bar the "logged" toast.
   */
  paged?: boolean;
  /** "Level 4", or the evolved build name once the pet has evolved. Only shown
   * on the day line while evolved — before that it just repeats the ring. */
  formLabel: string;
  accountInitial?: string;
  onOpenProfile: () => void;
  /** Opens Settings (the body profile form). Optional; hidden from the menu when absent. */
  onOpenSettings?: () => void;
  onOpenStats: () => void;
  onOpenToday: () => void;
  /**
   * Opens the friends list. Optional so the HUD still renders offline / signed
   * out (when there is nowhere for it to go) -- the menu row is only shown when
   * a handler is passed. Friends used to have its own disc on the rail; it now
   * lives in the account menu with Profile and Settings.
   */
  onOpenFriends?: () => void;
  /**
   * How many things the pet has said that have not been read yet. Shown as a
   * dot on the message button, never as text on the plaque: what the model
   * writes is a few sentences long, and putting that on the plaque pushed the
   * pet off screen and buried the day's stats under it.
   */
  unreadMessages?: number;
  /** Opens the conversation. Absent offline, which also hides the button. */
  onOpenChat?: () => void;
  /** Where coins are spent (the companion shop). Absent: the balance shows, but is not a button. */
  onOpenShop?: () => void;
  /** Says something to the pet out loud (see PetMicButton). Absent hides the mic. */
  onTalk?: (text: string) => void;
  /** A spoken message's reply is on its way. */
  talking?: boolean;
  /** `own` marks the adopted pet; the other one is the joint pet. With two, the
   *  name plate switches between them — adding one lives in Profile's
   *  care-partner card, not on the world screen. */
  pets?: { id: string; name: string; own?: boolean }[];
  activePetId?: string | null;
  onSelectPet?: (petId: string) => void;
  partnerName?: string;
  /** The day's weigh-in on Home (see WeighInPrompt); absent hides it. */
  weighIn?: WeighInPromptProps;
  /** Switches the chrome to a dark-panel/bright-text treatment so it stays
   * legible over the night backgrounds. */
  night?: boolean;
  /**
   * Whether a night's sleep can reach the app, which changes what an exhausted
   * pet asks for. See `AilmentAdvice` — sleep has no manual entry, so without
   * Apple Health "get some rest" is an instruction with nowhere to carry it out.
   */
  canLogSleep?: boolean;
}

/** Padding inside the readout panel, either side. */
const READOUT_PAD = 14;
const META_FONT = 10;
const META_SPACING = 0.8;
const CHIP_FONT = 9;
const CHIP_LINE = 12;
const CHIP_SPACING = 0.8;
const CHIP_PAD = 6;
const CHIP_GAP = 8;
/** The font never shrinks past this; any overflow left after it is scaled out as a whole row. */
const MIN_ROW_SCALE = 0.72;

/**
 * A mono label's width: every letter is 0.6em, an emoji about 1.25em, and a
 * Chinese character (the system face stands in for the mono one) two letters.
 * A slight overestimate, which only ever shrinks a row a touch early.
 */
const monoWidth = (text: string, fontSize: number, letterSpacing: number): number =>
  [...text.replace(/\uFE0E|\uFE0F/g, '')].reduce(
    (width, char) => width + charEm(char.codePointAt(0) ?? 0) * fontSize + letterSpacing,
    0,
  );
const charEm = (code: number): number => {
  // CJK, its punctuation and the full-width forms: two Latin letters wide.
  if (code >= 0x2e80 && code <= 0xffef) return 1.2;
  // A symbol or emoji (🔥, ❄︎, ✓) comes from a fallback font, wider than a letter.
  return code >= 0x2000 ? 1.25 : 0.6;
};

/** How far a row of `widths` must shrink to fit in `room` on one line. */
const rowScale = (widths: number[], gap: number, room: number): number => {
  const natural = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
  if (natural <= room || room <= 0) return 1;
  return Math.max(MIN_ROW_SCALE, room / natural);
};


/**
 * The pet's line when nothing is wrong and nothing just happened. Sleepy and
 * sluggish name the fix, like an ailment does: sleep only when Apple Health
 * can actually bring a night in, a meal otherwise.
 */
const moodLine = (mood: PetState['mood'], canLogSleep?: boolean): string => {
  if (mood === 'sleepy') return canLogSleep ? t("I'm so sleepy. A good night's sleep would help.") : t("I'm so sleepy. A good meal would perk me up.");
  if (mood === 'sluggish') return t("I feel sluggish. Walk or workout?");
  if (mood === 'bright') return t("I'm feeling bright.");
  if (mood === 'hungry') return t("I'm feeling hungry.");
  return t("I'm feeling content.");
};

/** The bond as the status row's token and as VoiceOver's sentence; nothing to say while neutral. */
const bondWords = (stage: BondStage, pet: string): { token: string; label: string } | null => {
  if (stage === 'devoted') return { token: t('DEVOTED'), label: t('{pet} is devoted toward you', { pet }) };
  if (stage === 'warm') return { token: t('WARM'), label: t('{pet} is warm toward you', { pet }) };
  if (stage === 'wary') return { token: t('WARY'), label: t('{pet} is wary toward you', { pet }) };
  if (stage === 'sulking') return { token: t('SULKING'), label: t('{pet} is sulking toward you', { pet }) };
  return null;
};

export function PetWorldHud({
  pet,
  events,
  careToast,
  environment,
  paged = false,
  formLabel,
  accountInitial,
  onOpenProfile,
  onOpenSettings,
  onOpenStats,
  onOpenToday,
  todayProgress,
  todayGoals,
  onOpenFriends,
  unreadMessages = 0,
  onOpenChat,
  onOpenShop,
  onTalk,
  talking = false,
  pets,
  activePetId,
  onSelectPet,
  partnerName,
  weighIn,
  night,
  canLogSleep,
}: PetWorldHudProps) {
  const today = new Date();
  const streaks = calculateStreakStatus(events, today);
  // Still alive, but nothing logged yet today: don't let the flame read as
  // "banked" when it's actually one missed day away from resetting.
  const streakAtRisk = streaks.currentStreak > 0 && !streaks.todayQualifies;
  const condition = assessCondition(pet);
  const coins = coinsOf(pet);

  // How it feels: an ailment if something is wrong, the mood line otherwise.
  // What it says about the thing just logged is said once, in its own voice,
  // in the speech bubble over it (see DashboardScreen); repeating the stock
  // line here made every log answer twice.
  const baseFeeling = condition.primary
    ? AILMENT_MESSAGE[condition.primary](pet.name, { canLogSleep })
    : moodLine(pet.mood, canLogSleep);
  // Then said the way THIS pet would say it: its personality, filtered through
  // whatever is wrong with it right now. See `petVoice`.
  // How it feels about you, from your own care history. Derived on every
  // render like the ailments are, and never stored.
  const bond = bondFor(events, today, { adoptedAt: pet.adoptedAt });
  const feeling = petVoice(baseFeeling, { personality: pet.personality, ailments: condition.ailments, bond: bond.stage });

  // Separate tokens, not one joined string: the row below lays them out, and a
  // wrap then falls between tokens rather than inside a separator.
  const bondSays = bondWords(bond.stage, pet.name);
  const bondToken = bondSays ? bondSays.token : null;
  const flameToken = streaks.currentStreak > 0 ? `🔥 ${streaks.currentStreak}` : null;
  const freezeToken = streaks.currentStreak > 0 && streaks.freezes > 0 ? `❄︎ ${streaks.freezes}` : null;

  const showSwitcher = pets && pets.length > 1 && onSelectPet;
  // With two pets the name plate is the switch: a tap shows the next one.
  const activeIndex = showSwitcher ? Math.max(0, pets!.findIndex((candidate) => candidate.id === (activePetId ?? pets![0].id))) : 0;
  const nextPet = showSwitcher ? pets![(activeIndex + 1) % pets!.length] : null;
  const showingJoint = showSwitcher ? !pets![activeIndex]!.own : false;

  // The account menu. Closed on any choice and on a tap anywhere else.
  const [menuOpen, setMenuOpen] = useState(false);
  /** The mic's caption is up (see PetMicButton). */
  const [micCaption, setMicCaption] = useState(false);
  // What the first-run tour points at (see FirstRunTour).
  const accountTourRef = useTourTarget('account');
  const todayTourRef = useTourTarget('today');
  const chatTourRef = useTourTarget('chat');
  const levelTourRef = useTourTarget('level');
  const petSwitchTourRef = useTourTarget('petSwitch');
  const choose = (open: () => void) => () => {
    setMenuOpen(false);
    open();
  };
  const menuItems: { label: string; accessibilityLabel: string; onPress: () => void; icon?: boolean }[] = [
    { label: t('Profile'), accessibilityLabel: t('Open profile'), onPress: choose(onOpenProfile) },
    ...(onOpenSettings ? [{ label: t('Settings'), accessibilityLabel: t('Open settings'), onPress: choose(onOpenSettings) }] : []),
    ...(onOpenFriends ? [{ label: t('Friends'), accessibilityLabel: t('Open friends'), onPress: choose(onOpenFriends), icon: true }] : []),
  ];

  // The pet's line and its meta, as one card. Built once, laid out below.
  const streakCounts = { streak: streaks.currentStreak, best: streaks.longestStreak };
  const metaLabel =
    streaks.currentStreak > 0
      ? streaks.freezes > 0
        ? streakAtRisk
          ? tn(
              streaks.freezes,
              '{streak} day streak, best {best}, {count} freeze saved, not yet logged today',
              '{streak} day streak, best {best}, {count} freezes saved, not yet logged today',
              streakCounts,
            )
          : tn(streaks.freezes, '{streak} day streak, best {best}, {count} freeze saved', '{streak} day streak, best {best}, {count} freezes saved', streakCounts)
        : streakAtRisk
          ? t('{streak} day streak, best {best}, not yet logged today', streakCounts)
          : t('{streak} day streak, best {best}', streakCounts)
      : t('Day {day} with {pet}', { day: daysWithPet(pet, today), pet: pet.name });

  // Talking to the pet, with a dot when it has said something unread.
  const chatButton = onOpenChat ? (
    <Pressable
      ref={chatTourRef}
      accessibilityRole="button"
      accessibilityLabel={unreadMessages > 0 ? t('Talk to {pet}, {count} unread', { pet: pet.name, count: unreadMessages }) : t('Talk to {pet}', { pet: pet.name })}
      onPress={onOpenChat}
      hitSlop={6}
      style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.pill, pressed && retroPressed]}
    >
      <Text style={[retro.label, styles.pillLabel, night && retro.labelNight]}>{t('CHAT')}</Text>
      {unreadMessages > 0 ? (
        <View testID="companion-unread" style={[styles.unreadDot, night && styles.unreadDotNight]} pointerEvents="none" />
      ) : null}
    </Pressable>
  ) : null;

  // The last row is where the HUD ends: rooms keep their buttons below it.
  const hudEdge = useReportHudEdge();

  // Sized for the screen: a notch-free screen needs less room up top, and a
  // tablet draws the whole HUD zoomed (see chromeScale). Both are no-ops on a
  // notched phone.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const chromeScale = chromeScaleFor(screenWidth, screenHeight);

  // The meta line and the chips each stay on one row, whatever the numbers:
  // too wide, and the row shrinks as a whole (every token the same size),
  // rather than wrapping one chip onto a row of its own or clipping the streak.
  const [readoutWidth, setReadoutWidth] = useState(screenWidth - 2 * GUTTER);
  const readoutRoom = readoutWidth - 2 * (READOUT_PAD + RETRO_BORDER_WIDTH);
  const leadTokens = [flameToken, freezeToken, bondToken].filter((token): token is string => token !== null);
  const chipScale = rowScale(
    (todayGoals ?? []).map((goal) => monoWidth(goal.done ? `✓ ${goal.label}` : goal.label, CHIP_FONT, CHIP_SPACING) + 2 * CHIP_PAD),
    CHIP_GAP,
    readoutRoom,
  );
  const chipSized =
    chipScale < 1 ? { fontSize: CHIP_FONT * chipScale, lineHeight: CHIP_LINE * chipScale, letterSpacing: CHIP_SPACING * chipScale } : null;
  // The estimate above can still come up short (a larger text size in
  // Settings, a font a touch wider than guessed), so the real widths settle
  // it: if the chips as drawn still overflow, the row is scaled down as a
  // whole. It never wraps.
  const [chipWidths, setChipWidths] = useState<Record<string, number>>({});
  const measureToken = (key: string) => (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setChipWidths((widths) => (Math.abs((widths[key] ?? 0) - width) < 0.5 ? widths : { ...widths, [key]: width }));
  };
  const goalIds = (todayGoals ?? []).map((goal) => goal.id);
  const drawnWidth = goalIds.every((id) => chipWidths[id] !== undefined)
    ? goalIds.reduce((sum, id) => sum + chipWidths[id], 0) + CHIP_GAP * chipScale * Math.max(0, goalIds.length - 1)
    : 0;
  const rowFit = drawnWidth > readoutRoom && readoutRoom > 0 ? readoutRoom / drawnWidth : 1;
  // The Gym, Kitchen, Outside and Study are pages with the pet in a small
  // window (see RoomPanel): no HUD over it. The day's
  // progress rides in the window's corner (WindowTodayRing), scrolling with it.
  // Its "logged" toast hangs under the window, from the page (RoomPanel).
  if (paged) return null;
  const zoom = hudZoom(screenWidth, screenHeight, chromeScale);
  const topInset = topInsetFor(screenWidth, screenHeight);

  return (
    // `box-none`: the HUD layer spans the whole screen and sits on top of the
    // environment's action row, so without this its empty space swallows every
    // tap meant for the buttons underneath. Its own controls stay tappable
    // because they are real press targets.
    <View style={[styles.fill, zoom]} pointerEvents="box-none">
      {menuOpen ? (
        // A real press target under everything, so a tap on the scene closes
        // the menu instead of poking the pet.
        <Pressable accessibilityLabel={t('Close account menu')} onPress={() => setMenuOpen(false)} style={styles.backdrop} />
      ) : null}

      {/* Row 1, the top bar: progression, where you are, and you. */}
      <View style={[styles.topRow, { paddingTop: topInset }]} pointerEvents="box-none">
        <View ref={levelTourRef} collapsable={false}>
          <LevelRing level={pet.level} xpPct={pet.xp} onPress={onOpenStats} night={night} size={RING} />
        </View>

        {/* With two pets the whole plate switches between them, and a small
            triangle in its corner says so. With one it is inert: a tap anywhere
            here reaches the pet behind it. */}
        <Pressable
          ref={petSwitchTourRef}
          disabled={!nextPet}
          pointerEvents={nextPet ? 'auto' : 'none'}
          accessibilityRole={nextPet ? 'button' : undefined}
          accessibilityLabel={nextPet ? (nextPet.own ? t('Show {pet}, your own pet', { pet: nextPet.name }) : t('Show {pet}, your joint pet', { pet: nextPet.name })) : undefined}
          onPress={() => nextPet && onSelectPet!(nextPet.id)}
          style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.plate, pressed && retroPressed]}
          testID="pet-plate"
        >
          <Text style={[retro.kicker, night && retro.kickerNight, styles.roomKicker]} numberOfLines={1}>
            {showingJoint ? t('{room} · JOINT', { room: ENVIRONMENT_LABEL[environment].toUpperCase() }) : ENVIRONMENT_LABEL[environment].toUpperCase()}
          </Text>
          {/* The plate is ~106pt inside at 320pt, ~176pt at 390: in 18pt mono
              that is 9 and 15 letters. A longer name shrinks first, then takes
              a second line (still shorter than the ring beside it), rather than
              ending in "…" on the pet's own screen. */}
          <FitText style={[styles.name, night && retro.labelNight]} minScale={0.7}>
            {pet.name.toUpperCase()}
          </FitText>
          {nextPet ? <View style={[styles.switchCorner, night && styles.switchCornerNight]} pointerEvents="none" /> : null}
        </Pressable>

        <View style={styles.accountSlot} pointerEvents="box-none">
          <Pressable
            ref={accountTourRef}
            accessibilityRole="button"
            accessibilityLabel={t('Open account menu')}
            accessibilityState={{ expanded: menuOpen }}
            onPress={() => setMenuOpen((open) => !open)}
            hitSlop={8}
            style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.disc, (pressed || menuOpen) && retroPressed]}
          >
            <Text style={[styles.discInitial, night && retro.labelNight]}>{initialOf(accountInitial ?? pet.name)}</Text>
          </Pressable>

          {menuOpen ? (
            <View accessibilityRole="menu" style={[retro.panel, night && retro.panelNight, styles.menu]}>
              {menuItems.map((item, index) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="menuitem"
                  accessibilityLabel={item.accessibilityLabel}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.menuItem,
                    index > 0 && styles.menuItemDivider,
                    index > 0 && night && styles.menuItemDividerNight,
                    pressed && styles.menuItemPressed,
                  ]}
                >
                  <Text style={[retro.label, styles.menuLabel, night && retro.labelNight]}>{item.label}</Text>
                  {item.icon ? (
                    <Image
                      source={FRIENDS_ICON}
                      resizeMode="contain"
                      style={[styles.menuIcon, { tintColor: night ? world.nightText : world.ink }]}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/*
        Row 2, the pet's line, across the full width. It used to sit in the
        narrow strip between two 96px side columns, where a one-line sentence
        wrapped to five and the card grew down over the pet and the room's own
        buttons. Full width, the same sentence takes one or two lines.

        OPAQUE on purpose: on a plaque the text's contrast depends only on the
        panel, never on the art behind it (see hudContrast.test).
      */}
      <View
        style={[retro.panel, night && retro.panelNight, styles.readout]}
        pointerEvents="none"
        onLayout={(event) => setReadoutWidth(event.nativeEvent.layout.width)}
      >
        {/* Two lines at most, whatever the pet says: the readout has a fixed
            ceiling so the rows under it never move far. A longer line shrinks
            a touch first, then ends in an ellipsis. */}
        <FitText style={[styles.feeling, night && retro.labelNight]} lines={2} minScale={0.85}>
          {feeling}
        </FitText>
        {/* What is left of today, on a row of its own. A done goal keeps its
            place with a tick, so nothing jumps. */}
        {todayGoals && todayGoals.length > 0 ? (
          <View
            style={[styles.chipRow, { columnGap: CHIP_GAP * chipScale }, rowFit < 1 && { transform: [{ scale: rowFit }] }]}
            accessibilityLabel={t('Today: {goals}', { goals: todayGoals.map((goal) => (goal.done ? t('{goal} done', { goal: goal.label }) : goal.label)).join(', ') })}
          >
            {todayGoals.map((goal) => (
              <Text
                key={goal.id}
                onLayout={measureToken(goal.id)}
                numberOfLines={1}
                style={[styles.metaTag, chipSized, night && styles.metaTagNight, goal.done && styles.metaTagDone, goal.done && night && styles.metaTagDoneNight]}
              >
                {goal.done ? `✓ ${goal.label}` : goal.label}
              </Text>
            ))}
          </View>
        ) : null}
        {/* The quiet line under it: the streak, the bond, and who else raises
            this pet. */}
        {leadTokens.length > 0 || partnerName ? (
          <View style={styles.statusRow} accessibilityLabel={partnerName ? t('{status}. Raised with {partner}', { status: metaLabel, partner: partnerName }) : metaLabel}>
            {flameToken ? (
              <Text numberOfLines={1} style={[styles.meta, styles.metaFlame, night && styles.metaFlameNight, streakAtRisk && styles.metaFlameAtRisk]}>
                {flameToken}
              </Text>
            ) : null}
            {freezeToken ? (
              <Text numberOfLines={1} style={[styles.meta, styles.metaFreeze]} testID="streak-freezes">
                {freezeToken}
              </Text>
            ) : null}
            {/* The relationship, only when it has something to say; cooling reads in coral. */}
            {bondToken ? (
              <Text
                numberOfLines={1}
                style={[styles.meta, night && retro.captionNight, (bond.stage === 'sulking' || bond.stage === 'wary') && styles.metaBondCool]}
                accessibilityLabel={bondSays?.label}
              >
                {bondToken}
              </Text>
            ) : null}
            {partnerName ? (
              <Text numberOfLines={1} style={[styles.metaPartner, night && styles.metaPartnerNight]}>{t('Raised with {partner}', { partner: partnerName })}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Row 3, tools: which pet (only with two), then chat. */}
      <View ref={hudEdge.ref} onLayout={hudEdge.onLayout} style={styles.toolRow} pointerEvents="box-none">
        {/* Left, across from TODAY: the coin balance, the way into the shop
            where coins are spent. */}
        <View style={styles.leftTools} pointerEvents="box-none">
          <Pressable
            accessibilityRole={onOpenShop ? 'button' : 'text'}
            accessibilityLabel={onOpenShop ? tn(coins, '{count} coin, open the shop', '{count} coins, open the shop') : tn(coins, '{count} coin', '{count} coins')}
            disabled={!onOpenShop}
            onPress={onOpenShop}
            hitSlop={6}
            style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.pill, styles.coinPill, pressed && retroPressed]}
            testID="coin-balance"
          >
            <CoinMark size={18} />
            <Text style={[retro.label, styles.coinLabel, night && retro.labelNight]} numberOfLines={1}>
              {coins.toLocaleString(formatLocale())}
            </Text>
          </Pressable>
        </View>

        {/* CHAT, then TODAY at the edge: the thing opened most, as a disc like
            the level's, the day's progress running round it. Side by side: CHAT
            stacked under it made the tools as tall as the rest of the HUD. */}
        <View style={styles.tools} pointerEvents="box-none">
          {chatButton}
          <View ref={todayTourRef} collapsable={false}>
            <LevelRing
              level={0}
              kicker={t('TODAY')}
              value={`${Math.round(todayProgress ?? 0)}%`}
              xpPct={todayProgress ?? 0}
              onPress={onOpenToday}
              night={night}
              size={RING}
              accessibilityLabel={t("Open today's detail, {percent} percent done", { percent: Math.round(todayProgress ?? 0) })}
            />
          </View>
        </View>
      </View>

      {/* Talking out loud, from the bottom-right corner just above the room
          bar, where a thumb rests: the reply comes back in the speech bubble. */}
      {/* Living room only: every other room keeps that corner for its log button. */}
      {onTalk && environment === 'main' && canListen() ? (
        <View style={[styles.mic, { bottom: navBarHeight(chromeScale) + 4 }]} pointerEvents="box-none">
          <PetMicButton petName={pet.name} onSay={onTalk} busy={talking} night={night} size={MIC} onCaption={setMicCaption} />
        </View>
      ) : null}

      {/* Home only, bottom left across from the mic: the day's weigh-in, until it is done. */}
      {/* Hidden while the mic's caption is up: that caption runs across the same strip. */}
      {weighIn && environment === 'main' && !micCaption ? (
        <WeighInPrompt {...weighIn} bottom={navBarHeight(chromeScale) + 4} night={night} />
      ) : null}

      <CareToastBanner toast={careToast} night={night} />
    </View>
  );
}

/**
 * A tablet's HUD: laid out on a screen `scale` times smaller than the real one,
 * then zoomed about its centre to cover it exactly. Every row, gap and font
 * grows together, so the layout is the phone's, just bigger — no second set of
 * sizes to keep in step. Nothing at a scale of 1.
 */
const hudZoom = (width: number, height: number, scale: number): ViewStyle | null => {
  if (scale === 1 || !(width > 0) || !(height > 0)) return null;
  const innerWidth = width / scale;
  const innerHeight = height / scale;
  return {
    flex: 0,
    position: 'absolute',
    width: innerWidth,
    height: innerHeight,
    left: (width - innerWidth) / 2,
    top: (height - innerHeight) / 2,
    transform: [{ scale }],
  };
};

/** The level ring and the account disc frame the top bar; the plate sits between. */
const RING = 64;
/** The Today ring in a room's window: smaller, it shares the window with the pet and what it says. */
const WINDOW_RING = 54;
const DISC = 44;
/** Chat and the coin balance share one height. */
const TOOL = 36;
const GUTTER = 16;
/** The mic: a size up from the pills, being the one held down. */
const MIC = 52;

const styles = themedStyles(() => ({
  fill: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: GUTTER,
    // `paddingTop` is set inline: it clears the notch or status bar (see topInsetFor).
    // Above the rows that follow it, so the account menu it opens is drawn
    // over the status card and the tools rather than under them.
    zIndex: 10,
    elevation: 10,
  },
  accountSlot: { width: RING, alignItems: 'flex-end' },

  plate: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    alignItems: 'center',
  },
  roomKicker: { fontSize: 10, marginBottom: 1 },
  // A small triangle tucked into the plate's lower-right corner: "there is more here".
  // Drawn with borders: the bottom edge is the triangle, and the transparent
  // left edge cuts its diagonal.
  switchCorner: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderBottomColor: world.accent,
  },
  switchCornerNight: { borderBottomColor: world.nightAccent },
  name: {
    fontFamily: fonts.systemMono,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    color: world.ink,
    textAlign: 'center',
  },

  /** The plaque itself; shape only — colour, border and shadow come from `retro.panel`. */
  readout: {
    marginTop: 12,
    marginHorizontal: GUTTER,
    alignItems: 'center',
    paddingHorizontal: READOUT_PAD,
    paddingTop: 8,
    paddingBottom: 9,
  },
  feeling: {
    fontFamily: fonts.systemMono,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: 0.2,
    color: world.ink,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    columnGap: 8,
    alignItems: 'center',
    marginTop: 6,
  },

  meta: {
    // Never squeezed by the row (web shrinks text by default, wrapping it
    // inside itself); the row scales as a whole instead.
    flexShrink: 0,
    fontFamily: fonts.systemMono,
    fontSize: META_FONT,
    fontWeight: '700',
    letterSpacing: META_SPACING,
    color: world.inkSoft,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 2,
    marginTop: 6,
  },
  // The one user-typed token in the row: a long handle or display name takes
  // a line of its own (the row wraps), and past that line ends in "…" rather
  // than running off the plaque.
  metaPartner: {
    flexShrink: 1,
    maxWidth: '100%',
    fontFamily: fonts.systemMono,
    fontSize: 10,
    letterSpacing: 0.4,
    color: '#7d6d5e',
    textAlign: 'center',
  },
  metaPartnerNight: { color: '#a99a83' },
  /** Sits on the pill's corner, outlined so it reads over the panel border. */
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: world.accent,
    borderColor: world.surface,
  },
  unreadDotNight: { backgroundColor: world.nightAccent, borderColor: world.nightSurface },
  metaBondCool: { color: world.accentDeep },
  metaFlame: { color: world.accentDeep, fontWeight: '700' },
  metaFlameNight: { color: world.nightAccent },
  /** Alive but not yet re-earned today — dimmed, not the same as a banked day. */
  metaFlameAtRisk: { opacity: 0.6, fontWeight: '600' },
  metaFreeze: { color: FROZEN_COLOR, fontWeight: '700' },
  // Today's goal tokens — warm gold while still to do, green once done. Each is
  // its own chip, so a done one can change colour without moving the rest.
  metaTag: {
    flexShrink: 0,
    fontFamily: fonts.systemMono,
    fontSize: CHIP_FONT,
    lineHeight: CHIP_LINE,
    fontWeight: '700',
    letterSpacing: CHIP_SPACING,
    textTransform: 'uppercase',
    color: '#7a5f16',
    backgroundColor: 'rgba(214,183,96,0.35)',
    borderRadius: 5,
    paddingHorizontal: CHIP_PAD,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  metaTagNight: { color: '#e4c878', backgroundColor: 'rgba(228,200,120,0.16)' },
  metaTagDone: { color: '#3f6b2e', backgroundColor: 'rgba(120,170,90,0.28)' },
  metaTagDoneNight: { color: '#a9d68f', backgroundColor: 'rgba(150,200,120,0.16)' },

  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discInitial: { fontFamily: fonts.systemMono, fontSize: 19, fontWeight: '700', color: world.ink },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Hangs off the bottom of the account disc, wider than the side column so
  // the labels do not wrap; it overlaps the identity plate, which is fine —
  // it is only up while the menu is.
  menu: {
    position: 'absolute',
    top: DISC + 8,
    right: 0,
    width: 168,
    paddingVertical: 4,
    zIndex: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    // 44 pt a row, as iOS asks of anything tapped; at 12 + text it was 38.
    minHeight: 44,
  },
  menuItemDivider: { borderTopWidth: 1, borderTopColor: 'rgba(67,55,44,0.18)' },
  menuItemDividerNight: { borderTopColor: 'rgba(239,229,208,0.16)' },
  menuItemPressed: { opacity: 0.6 },
  menuLabel: { fontSize: 12, letterSpacing: 1.2 },
  menuIcon: { width: 18, height: 18 },
  toolRow: {
    flexDirection: 'row',
    // Top-aligned: TODAY's column is taller than the switch beside it.
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    marginTop: 12,
  },
  // Level with the middle of TODAY's disc, not its top edge.
  leftTools: { alignItems: 'flex-start', gap: 10, flexShrink: 1, marginTop: (RING - TOOL) / 2 },
  coinPill: { flexDirection: 'row', gap: 7, paddingLeft: 9, paddingRight: 13 },
  coinLabel: { fontSize: 13, letterSpacing: 0.6, fontVariant: ['tabular-nums'] },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    height: TOOL,
    borderRadius: TOOL / 2,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: { fontSize: 11, letterSpacing: 1.3 },
  mic: { position: 'absolute', right: GUTTER },

}));

/** The day's progress, small, in a room window's top-right corner: a tap opens Today. */
export function WindowTodayRing({ todayProgress, onOpenToday, night }: { todayProgress?: number; onOpenToday?: () => void; night?: boolean }) {
  const pct = Math.round(todayProgress ?? 0);
  return (
    <LevelRing
      level={0}
      kicker={t('TODAY')}
      value={`${pct}%`}
      xpPct={todayProgress ?? 0}
      onPress={onOpenToday ?? (() => {})}
      night={night}
      size={WINDOW_RING}
      accessibilityLabel={t("Open today's detail, {percent} percent done", { percent: pct })}
    />
  );
}
