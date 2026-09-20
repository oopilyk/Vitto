import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { fonts, world } from '../theme';
import { CareToastBanner } from './CareToastBanner';
import { LevelRing } from './LevelRing';
import { retro, retroPressed } from './retroStyle';
import { ENVIRONMENT_LABEL, type EnvironmentId } from './types';

/** The product owner's own friends glyph, tinted per day/night at render time. */
const FRIENDS_ICON = require('../../assets/buttons/freinds_button.png');

/**
 * The chrome that isn't either scene, in the pet-world's pixel-UI language.
 * One clear hierarchy, not a wall of equal boxes:
 *
 *   primary    — the level ring (progression, top-left).
 *   identity   — ONE plate, top-centre: the room as a kicker over the pet's
 *                name. Directly beneath it, un-boxed on the scene, the pet's
 *                state line ("Miso is feeling bright.") and one quiet meta line
 *                (day count, streak, partner) — no separate chips or boxes.
 *   secondary  — the account disc (a menu: Profile, Settings, Friends) and the
 *                today pill down the right edge, and the pet switcher (only when
 *                there are two pets) under the ring.
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
        : (reaction?.message ?? `I'm feeling ${pet.mood}.`);
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
  const choose = (open: () => void) => () => {
    setMenuOpen(false);
    open();
  };
  const menuItems: { label: string; onPress: () => void; icon?: boolean }[] = [
    { label: 'Profile', onPress: choose(onOpenProfile) },
    ...(onOpenSettings ? [{ label: 'Settings', onPress: choose(onOpenSettings) }] : []),
    ...(onOpenFriends ? [{ label: 'Friends', onPress: choose(onOpenFriends), icon: true }] : []),
  ];

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
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.sideLeft}>
          <LevelRing level={pet.level} xpPct={pet.xp} onPress={onOpenStats} night={night} />

          {/* Only when there really are two pets: a quiet switcher under the
              ring. Adding a joint pet is a deliberate social action and lives
              in Profile's care-partner card, not as a button on the world. */}
          {showSwitcher ? (
            <View style={styles.slotColumn} pointerEvents="box-none">
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
                    style={[
                      retro.panelQuiet,
                      night && retro.panelQuietNight,
                      styles.petTab,
                      selected && styles.petTabOn,
                    ]}
                  >
                    <Text
                      style={[
                        retro.kicker,
                        night && retro.kickerNight,
                        styles.petTabKicker,
                        selected && styles.petTabTextOn,
                      ]}
                    >
                      {candidate.own ? 'MINE' : 'JOINT'}
                    </Text>
                    <Text
                      style={[styles.petTabName, night && retro.labelNight, selected && styles.petTabTextOn]}
                      numberOfLines={1}
                    >
                      {candidate.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Inert: a tap anywhere here reaches the pet behind it. */}
        <View style={styles.center} pointerEvents="none">
          {/* One plate: the room as a kicker over the pet's name. Replaces the
              two separate name / room plates that used to stack here. */}
          <View style={[retro.panel, night && retro.panelNight, styles.plate]}>
            <Text style={[retro.kicker, night && retro.kickerNight, styles.roomKicker]} numberOfLines={1}>
              {ENVIRONMENT_LABEL[environment].toUpperCase()}
            </Text>
            <Text style={[styles.name, night && retro.labelNight]} numberOfLines={1}>
              {pet.name.toUpperCase()}
            </Text>
          </View>

          {/*
            The pet's line and its meta sit on a plaque of their own — the same
            cream-with-ink-border-and-hard-shadow panel as the room sign above
            and the pet tabs beside it, so it belongs to the HUD rather than
            floating over the scene.

            The plaque is OPAQUE, and that is the point. The text used to be
            painted straight onto the art (and then onto a translucent scrim),
            so its contrast depended on whatever the picture behind it happened
            to be — bright cloud outdoors, mid-brown wall in the study — and
            no single text colour survives both. On an opaque surface the only
            thing that matters is the panel's own colour, which the HUD
            controls: ink on cream by day, cream on charcoal at night, both
            measured (see hudContrast.test).
          */}
          <View style={[retro.panel, night && retro.panelNight, styles.readout]}>
          {/* The whole sentence, however long. Capped at two lines it ended in
              "Get some …", which is the one line people glance up for. */}
          <Text style={[styles.feeling, night && retro.labelNight]}>
            {feeling}
          </Text>
          {/*
            The meta as a row of tokens with a gap, not a sentence with "·"
            between the parts. Joined into one string, a narrow plaque wrapped
            it after the dot and left "DAY 19 · RUNNER ·" on one line and the
            flame alone on the next. Tokens wrap cleanly between themselves and
            need no punctuation at all.
          */}
          <View
            style={styles.metaRow}
            accessibilityLabel={
              streaks.currentStreak > 0
                ? `${dayLabel}. ${streaks.currentStreak} day streak, best ${streaks.longestStreak}` +
                  (streakAtRisk ? ', not yet logged today.' : '.')
                : dayLabel
            }
          >
            <Text style={[styles.meta, night && retro.captionNight]}>{dayToken}</Text>
            {formToken ? (
              <Text style={[styles.meta, night && retro.captionNight]}>{formToken}</Text>
            ) : null}
            {/* The relationship, only when it has something to say: neutral is
                the default and would just be noise. Sulking and wary read in
                coral, so a cooling bond is noticed before it bottoms out. */}
            {bond.stage !== 'neutral' ? (
              <Text
                style={[
                  styles.meta,
                  night && retro.captionNight,
                  (bond.stage === 'sulking' || bond.stage === 'wary') && styles.metaBondCool,
                ]}
                accessibilityLabel={`${pet.name} is ${bond.stage} toward you`}
              >
                {bond.stage.toUpperCase()}
              </Text>
            ) : null}
            {streaks.currentStreak > 0 ? (
              <Text
                style={[
                  styles.meta,
                  styles.metaFlame,
                  night && styles.metaFlameNight,
                  streakAtRisk && styles.metaFlameAtRisk,
                ]}
              >
                {`🔥 ${streaks.currentStreak}`}
              </Text>
            ) : null}
          </View>
          {/* A sentence, so it gets its own line rather than a slot in the row. */}
          {partnerName ? (
            <Text style={[styles.metaPartner, night && styles.metaPartnerNight]}>
              {`Raised with ${partnerName}`}
            </Text>
          ) : null}
          {/*
            The food effects get their own row rather than being appended to the
            line above. Strung into that sentence with "·" separators baked into
            the text, a wrap put the separator at the START of the next line and
            the row read as broken punctuation. As separate chips the line breaks
            between tags instead, and never in front of one.
          */}
          {foodTags.length > 0 ? (
            <View
              style={styles.metaTags}
              accessibilityLabel={`Effects: ${foodTags.join(', ')}`}
            >
              {foodTags.map((tag) => (
                <Text key={tag} style={[styles.metaTag, night && styles.metaTagNight]}>
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}
          </View>
        </View>

        <View style={styles.sideRight} pointerEvents="box-none">
          {/* The account disc opens the menu; today is a pill of the same
              height, coral-outlined so it reads as "your daily goals" rather
              than another nav button. */}
          <View style={styles.rail} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open account menu"
              accessibilityState={{ expanded: menuOpen }}
              onPress={() => setMenuOpen((open) => !open)}
              hitSlop={8}
              style={({ pressed }) => [
                retro.panel,
                night && retro.panelNight,
                styles.disc,
                (pressed || menuOpen) && retroPressed,
              ]}
            >
              <Text style={[styles.discInitial, night && retro.labelNight]}>
                {(accountInitial ?? pet.name.charAt(0)).toUpperCase()}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open today's detail"
              accessibilityHint="Your goals for today"
              onPress={onOpenToday}
              hitSlop={8}
              style={({ pressed }) => [
                retro.panel,
                night && retro.panelNight,
                styles.pill,
                styles.pillGoals,
                night && styles.pillGoalsNight,
                pressed && retroPressed,
              ]}
            >
              <Text style={[retro.label, styles.pillLabel, night ? styles.pillLabelNight : styles.pillLabelGoals]}>
                TODAY
              </Text>
            </Pressable>

            {/* Talking to the pet. A pill the twin of TODAY, in plain ink so
                coral keeps meaning "your goals", with a dot when it has said
                something you have not read — the message itself waits in the
                conversation. */}
            {onOpenChat ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  unreadMessages > 0
                    ? `Talk to ${pet.name}, ${unreadMessages} unread`
                    : `Talk to ${pet.name}`
                }
                onPress={onOpenChat}
                hitSlop={8}
                style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.pill, pressed && retroPressed]}
              >
                <Text style={[retro.label, styles.pillLabel, night && retro.labelNight]}>CHAT</Text>
                {unreadMessages > 0 ? (
                  <View testID="companion-unread" style={[styles.unreadDot, night && styles.unreadDotNight]} pointerEvents="none" />
                ) : null}
              </Pressable>
            ) : null}
          </View>

          {menuOpen ? (
            <View
              accessibilityRole="menu"
              style={[retro.panel, night && retro.panelNight, styles.menu]}
            >
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

      <CareToastBanner toast={careToast} night={night} />
    </View>
  );
}

/** Clears the notch / status bar — no boxed top bar reserves that space now. */
const TOP_INSET = 56;
/** Level-ring footprint; the side columns match it so the centre plate lands
 *  on the true screen centre. */
const SIDE_COLUMN = 96;
const DISC = 52;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: TOP_INSET,
  },
  sideLeft: { width: SIDE_COLUMN, alignItems: 'flex-start' },
  sideRight: { width: SIDE_COLUMN, alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },

  plate: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    alignItems: 'center',
    maxWidth: '100%',
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
    marginTop: 10,
    alignSelf: 'center',
    maxWidth: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
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
    flexWrap: 'wrap',
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
  metaTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
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

  rail: { alignItems: 'flex-end', gap: 12 },
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
  pill: {
    height: DISC,
    borderRadius: DISC / 2,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Coral-outlined so TODAY reads as "your daily goals", not another nav disc.
  pillGoals: { borderColor: world.accent },
  pillGoalsNight: { borderColor: world.nightAccent },
  pillLabel: { fontSize: 12, letterSpacing: 1.4 },
  pillLabelGoals: { color: world.accentDeep },
  pillLabelNight: { color: world.nightAccent },

  slotColumn: { marginTop: 10, gap: 6, width: SIDE_COLUMN, alignItems: 'stretch' },
  petTab: { paddingHorizontal: 10, paddingVertical: 6, alignItems: 'flex-start' },
  petTabOn: { borderColor: world.accent, backgroundColor: world.accentWash },
  petTabKicker: { fontSize: 8, letterSpacing: 1.2, marginBottom: 1 },
  petTabName: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700', color: world.inkSoft },
  petTabTextOn: { color: world.accentDeep },
});
