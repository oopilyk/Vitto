import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import {
  AILMENT_MESSAGE,
  bondFor,
  petVoice,
  activeFoodEffects,
  type CareToast,
  type HealthEvent,
  type PetReaction,
  type PetState,
  calculateStreakStatus,
  daysWithPet,
  assessCondition,
  hasEvolved,
} from '@vitto/core';
import { fonts, world, themedStyles } from '../theme';
import { CareToastBanner } from './CareToastBanner';
import { useReportHudEdge } from './RoomActionSlot';
import { LevelRing } from './LevelRing';
import { retro, retroPressed } from './retroStyle';
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
 *   2. status   — the pet's own line, full width, with its day, streak, bond
 *                 and food effects as one row of tokens beneath.
 *   3. tools    — the pet switcher (only with two pets) on the left, Today and
 *                 Chat on the right, all one height.
 *
 * The pet's condition is expressed as the pet's own line, not a badge; adding a
 * second joint pet lives in Profile's care-partner card, not here; and the full
 * stat sheet (buffs, ailments, every number) is one tap on the level ring away.
 */
interface PetWorldHudProps {
  pet: PetState;
  events: HealthEvent[];
  reaction: PetReaction | null;
  /**
   * Confirmation of the care moment just logged. Separate from `reaction`
   * because an ailment outranks that line, which left the user with no
   * acknowledgement at all whenever the pet happened to be unwell.
   */
  careToast?: CareToast | null;
  /** Which scene is on screen, named on the identity plate. */
  environment: EnvironmentId;
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
  /** `own` marks the adopted pet; the other one is the joint pet. Only shown as
   *  a switcher, and only when there really are two — adding one lives in
   *  Profile's care-partner card, not on the world screen. */
  pets?: { id: string; name: string; own?: boolean }[];
  activePetId?: string | null;
  onSelectPet?: (petId: string) => void;
  partnerName?: string;
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
const META_GAP = 12;
// The row is monospace, so a token's width is its length: about 0.6em a
// character, plus letter spacing (and a tag's own padding).
const metaTokenWidth = (token: string) => token.length * (10 * 0.6 + 0.8);
const metaTagWidth = (tag: string) => tag.length * (9 * 0.6 + 0.8) + 12;

/**
 * Which food tags fit on the meta row's one line after its fixed tokens (day,
 * form, bond, streak), and how many fold into a "+N" chip. Before the row has
 * been measured it shows two, as a safe guess.
 */
export const fitMetaTags = (tags: readonly string[], fixed: readonly string[], width: number): { shown: string[]; hidden: number } => {
  if (width <= 0) return { shown: tags.slice(0, 2), hidden: Math.max(0, tags.length - 2) };
  let used = fixed.reduce((total, token, index) => total + metaTokenWidth(token) + (index > 0 ? META_GAP : 0), 0);
  const shown: string[] = [];
  for (const [index, tag] of tags.entries()) {
    const left = tags.length - index - 1;
    const room = META_GAP + metaTagWidth(tag) + (left > 0 ? META_GAP + metaTagWidth(`+${left}`) : 0);
    if (used + room > width) break;
    used += META_GAP + metaTagWidth(tag);
    shown.push(tag);
  }
  return { shown, hidden: tags.length - shown.length };
};

/**
 * The pet's line when nothing is wrong and nothing just happened. Sleepy and
 * sluggish name the fix, like an ailment does: sleep only when Apple Health
 * can actually bring a night in, a meal otherwise.
 */
const moodLine = (mood: PetState['mood'], canLogSleep?: boolean): string => {
  if (mood === 'sleepy') return canLogSleep ? "I'm so sleepy. A good night's sleep would help." : "I'm so sleepy. A good meal would perk me up.";
  if (mood === 'sluggish') return "I feel sluggish. Walk or workout?";
  return `I'm feeling ${mood}.`;
};

export function PetWorldHud({
  pet,
  events,
  reaction,
  careToast,
  environment,
  formLabel,
  accountInitial,
  onOpenProfile,
  onOpenSettings,
  onOpenStats,
  onOpenToday,
  onOpenFriends,
  unreadMessages = 0,
  onOpenChat,
  pets,
  activePetId,
  onSelectPet,
  partnerName,
  night,
  canLogSleep,
}: PetWorldHudProps) {
  const today = new Date();
  const streaks = calculateStreakStatus(events, today);
  // Still alive, but nothing logged yet today: don't let the flame read as
  // "banked" when it's actually one missed day away from resetting.
  const streakAtRisk = streaks.currentStreak > 0 && !streaks.todayQualifies;
  const condition = assessCondition(pet);

  // An ailment outranks the reaction: a message about the meal just logged must
  // not sit on top of "Miso is fading". Otherwise it's the plain feeling line.
  // A food effect's own line ("That was hot!") beats the meal's stock reaction
  // while the reaction is up: it is the fun part, and the toast already carries
  // the rest. An ailment still outranks both.
  // A line the model wrote for this exact plate beats a food effect's generic
  // one-liner; the generic one still beats the engine's stock line.
  const baseFeeling = condition.primary
    ? AILMENT_MESSAGE[condition.primary](pet.name, { canLogSleep })
    : reaction?.authored
      ? reaction.message
      : reaction?.effects?.[0]
        ? reaction.effects[0].reaction
        : (reaction?.message ?? moodLine(pet.mood, canLogSleep));
  // Then said the way THIS pet would say it: its personality, filtered through
  // whatever is wrong with it right now. See `petVoice`.
  // How it feels about you, from your own care history. Derived on every
  // render like the ailments are, and never stored.
  const bond = bondFor(events, today, { adoptedAt: pet.adoptedAt });
  const feeling = petVoice(baseFeeling, { personality: pet.personality, ailments: condition.ailments, bond: bond.stage });

  // Tags the pet is wearing right now, from recent meals — derived, so they
  // expire on their own and survive a reload.
  const foodTags = activeFoodEffects(events, today).map((effect) => effect.label.toUpperCase());

  const evolved = hasEvolved(pet);
  // Separate tokens, not one joined string: the row below lays them out, and a
  // wrap then falls between tokens rather than inside a separator.
  const dayToken = `DAY ${daysWithPet(pet, today)}`;
  const formToken = evolved ? formLabel.toUpperCase() : null;
  const dayLabel = formToken ? `${dayToken} · ${formToken}` : dayToken;

  const showSwitcher = pets && pets.length > 1 && onSelectPet;

  // The account menu. Closed on any choice and on a tap anywhere else.
  const [menuOpen, setMenuOpen] = useState(false);
  // The readout's inner width, so the meta row can keep to one line.
  const [readoutWidth, setReadoutWidth] = useState(0);
  const fixedTokens = [
    dayToken,
    formToken,
    bond.stage !== 'neutral' ? bond.stage.toUpperCase() : null,
    streaks.currentStreak > 0 ? `🔥 ${streaks.currentStreak}` : null,
  ].filter((token): token is string => Boolean(token));
  const { shown: shownTags, hidden: hiddenTags } = fitMetaTags(foodTags, fixedTokens, readoutWidth);
  const choose = (open: () => void) => () => {
    setMenuOpen(false);
    open();
  };
  const menuItems: { label: string; onPress: () => void; icon?: boolean }[] = [
    { label: 'Profile', onPress: choose(onOpenProfile) },
    ...(onOpenSettings ? [{ label: 'Settings', onPress: choose(onOpenSettings) }] : []),
    ...(onOpenFriends ? [{ label: 'Friends', onPress: choose(onOpenFriends), icon: true }] : []),
  ];

  // The pet's line and its meta, as one card. Built once, laid out below.
  const metaLabel =
    streaks.currentStreak > 0
      ? `${dayLabel}. ${streaks.currentStreak} day streak, best ${streaks.longestStreak}` + (streakAtRisk ? ', not yet logged today.' : '.')
      : dayLabel;

  // The last row is where the HUD ends: rooms keep their buttons below it.
  const hudEdge = useReportHudEdge();

  return (
    // `box-none`: the HUD layer spans the whole screen and sits on top of the
    // environment's action row, so without this its empty space swallows every
    // tap meant for the buttons underneath. Its own controls stay tappable
    // because they are real press targets.
    <View style={styles.fill} pointerEvents="box-none">
      {menuOpen ? (
        // A real press target under everything, so a tap on the scene closes
        // the menu instead of poking the pet.
        <Pressable accessibilityLabel="Close account menu" onPress={() => setMenuOpen(false)} style={styles.backdrop} />
      ) : null}

      {/* Row 1, the top bar: progression, where you are, and you. */}
      <View style={styles.topRow} pointerEvents="box-none">
        <LevelRing level={pet.level} xpPct={pet.xp} onPress={onOpenStats} night={night} size={RING} />

        {/* Inert: a tap anywhere here reaches the pet behind it. */}
        <View style={[retro.panel, night && retro.panelNight, styles.plate]} pointerEvents="none">
          <Text style={[retro.kicker, night && retro.kickerNight, styles.roomKicker]} numberOfLines={1}>
            {ENVIRONMENT_LABEL[environment].toUpperCase()}
          </Text>
          <Text style={[styles.name, night && retro.labelNight]} numberOfLines={1}>
            {pet.name.toUpperCase()}
          </Text>
        </View>

        <View style={styles.accountSlot} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account menu"
            accessibilityState={{ expanded: menuOpen }}
            onPress={() => setMenuOpen((open) => !open)}
            hitSlop={8}
            style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.disc, (pressed || menuOpen) && retroPressed]}
          >
            <Text style={[styles.discInitial, night && retro.labelNight]}>{(accountInitial ?? pet.name.charAt(0)).toUpperCase()}</Text>
          </Pressable>

          {menuOpen ? (
            <View accessibilityRole="menu" style={[retro.panel, night && retro.panelNight, styles.menu]}>
              {menuItems.map((item, index) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`Open ${item.label.toLowerCase()}`}
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
        onLayout={(event) => setReadoutWidth(event.nativeEvent.layout.width - 2 * READOUT_PAD)}
      >
        {/* Two lines at most, whatever the pet says: the readout has a fixed
            ceiling so the rows under it never move far. A longer line shrinks
            a touch first, then ends in an ellipsis. */}
        <Text
          style={[styles.feeling, night && retro.labelNight]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {feeling}
        </Text>
        {/* Day, form, bond, streak and food effects on exactly one line: the
            tags that do not fit fold into a "+N" chip rather than wrapping. */}
        <View style={styles.metaRow} accessibilityLabel={metaLabel}>
          <Text style={[styles.meta, night && retro.captionNight]}>{dayToken}</Text>
          {formToken ? <Text style={[styles.meta, night && retro.captionNight]}>{formToken}</Text> : null}
          {/* The relationship, only when it has something to say; cooling reads in coral. */}
          {bond.stage !== 'neutral' ? (
            <Text
              style={[styles.meta, night && retro.captionNight, (bond.stage === 'sulking' || bond.stage === 'wary') && styles.metaBondCool]}
              accessibilityLabel={`${pet.name} is ${bond.stage} toward you`}
            >
              {bond.stage.toUpperCase()}
            </Text>
          ) : null}
          {streaks.currentStreak > 0 ? (
            <Text style={[styles.meta, styles.metaFlame, night && styles.metaFlameNight, streakAtRisk && styles.metaFlameAtRisk]}>
              {`🔥 ${streaks.currentStreak}`}
            </Text>
          ) : null}
          {shownTags.map((tag) => (
            <Text key={tag} style={[styles.metaTag, night && styles.metaTagNight]} accessibilityLabel={`Effect: ${tag}`}>
              {tag}
            </Text>
          ))}
          {hiddenTags > 0 ? (
            <Text style={[styles.metaTag, night && styles.metaTagNight]} accessibilityLabel={`${hiddenTags} more effects`}>
              {`+${hiddenTags}`}
            </Text>
          ) : null}
        </View>
        {partnerName ? <Text style={[styles.metaPartner, night && styles.metaPartnerNight]}>{`Raised with ${partnerName}`}</Text> : null}
      </View>

      {/* Row 3, tools: which pet (only with two), then today and chat. */}
      <View ref={hudEdge.ref} onLayout={hudEdge.onLayout} style={styles.toolRow} pointerEvents="box-none">
        {showSwitcher ? (
          <View style={[retro.panelQuiet, night && retro.panelQuietNight, styles.switcher]}>
            {pets!.map((candidate) => {
              const selected = candidate.id === (activePetId ?? pets![0].id);
              return (
                <Pressable
                  key={candidate.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: selected }}
                  accessibilityLabel={`Show ${candidate.name}, your ${candidate.own ? 'own' : 'joint'} pet`}
                  disabled={selected}
                  onPress={() => onSelectPet!(candidate.id)}
                  style={[styles.petTab, selected && styles.petTabOn]}
                >
                  <Text style={[styles.petTabName, night && retro.labelNight, selected && styles.petTabTextOn]} numberOfLines={1}>
                    {candidate.name}
                    {/* Only the shared one is marked: yours is the default. */}
                    {candidate.own ? null : <Text style={styles.petTabJoint}>{'  JOINT'}</Text>}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View />
        )}

        <View style={styles.tools} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open today's detail"
            accessibilityHint="Your goals for today"
            onPress={onOpenToday}
            hitSlop={6}
            style={({ pressed }) => [
              retro.panel,
              night && retro.panelNight,
              styles.pill,
              styles.pillGoals,
              night && styles.pillGoalsNight,
              pressed && retroPressed,
            ]}
          >
            <Text style={[retro.label, styles.pillLabel, night ? styles.pillLabelNight : styles.pillLabelGoals]}>TODAY</Text>
          </Pressable>

          {/* Talking to the pet, with a dot when it has said something unread. */}
          {onOpenChat ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unreadMessages > 0 ? `Talk to ${pet.name}, ${unreadMessages} unread` : `Talk to ${pet.name}`}
              onPress={onOpenChat}
              hitSlop={6}
              style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.pill, pressed && retroPressed]}
            >
              <Text style={[retro.label, styles.pillLabel, night && retro.labelNight]}>CHAT</Text>
              {unreadMessages > 0 ? (
                <View testID="companion-unread" style={[styles.unreadDot, night && styles.unreadDotNight]} pointerEvents="none" />
              ) : null}
            </Pressable>
          ) : null}
        </View>
      </View>

      <CareToastBanner toast={careToast} night={night} />
    </View>
  );
}

/** Clears the notch / status bar — no boxed top bar reserves that space now. */
const TOP_INSET = 56;
/** The level ring and the account disc frame the top bar; the plate sits between. */
const RING = 64;
const DISC = 44;
/** Today, chat and the pet switcher share one height. */
const TOOL = 36;
const GUTTER = 16;

const styles = themedStyles(() => ({
  fill: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: GUTTER,
    paddingTop: TOP_INSET,
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
  name: {
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    color: world.ink,
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
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: 0.2,
    color: world.ink,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 2,
    marginTop: 6,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: world.inkSoft,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  metaPartner: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    color: '#7d6d5e',
    textAlign: 'center',
    marginTop: 4,
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
  // Food effect tags — warm gold, so they read as a state the pet is in. Each is
  // its own chip so a narrow screen wraps between them, not inside a separator.
  metaTag: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#7a5f16',
    backgroundColor: 'rgba(214,183,96,0.35)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  metaTagNight: { color: '#e4c878', backgroundColor: 'rgba(228,200,120,0.16)' },

  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discInitial: { fontFamily: fonts.mono, fontSize: 19, fontWeight: '700', color: world.ink },
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
  },
  menuItemDivider: { borderTopWidth: 1, borderTopColor: 'rgba(67,55,44,0.18)' },
  menuItemDividerNight: { borderTopColor: 'rgba(239,229,208,0.16)' },
  menuItemPressed: { opacity: 0.6 },
  menuLabel: { fontSize: 12, letterSpacing: 1.2 },
  menuIcon: { width: 18, height: 18 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    marginTop: 12,
  },
  tools: { flexDirection: 'row', gap: 10 },
  pill: {
    height: TOOL,
    borderRadius: TOOL / 2,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Coral-outlined so TODAY reads as "your daily goals", not another nav disc.
  pillGoals: { borderColor: world.accent },
  pillGoalsNight: { borderColor: world.nightAccent },
  pillLabel: { fontSize: 11, letterSpacing: 1.3 },
  pillLabelGoals: { color: world.accentDeep },
  pillLabelNight: { color: world.nightAccent },

  // Two pets, one control: a segmented switch, the selected half filled.
  switcher: { flexDirection: 'row', height: TOOL, padding: 3, borderRadius: TOOL / 2, flexShrink: 1 },
  petTab: { paddingHorizontal: 12, borderRadius: (TOOL - 6) / 2, justifyContent: 'center', maxWidth: 110 },
  petTabOn: { backgroundColor: world.accentWash },
  petTabJoint: { fontSize: 8, letterSpacing: 1, opacity: 0.75 },
  petTabName: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700', color: world.inkSoft },
  petTabTextOn: { color: world.accentDeep },
}));
