import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AILMENT_MESSAGE,
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
 *   secondary  — the account / friends / today rail down the right edge, and
 *                the pet switcher (only when there are two pets) under the ring.
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
  onOpenStats: () => void;
  onOpenToday: () => void;
  /**
   * Opens the friends list. Optional so the HUD still renders offline / signed
   * out (when there is nowhere for it to go) -- the button is only shown when a
   * handler is passed, per the product owner's "every main page gets a friends
   * button" note.
   */
  onOpenFriends?: () => void;
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
  onOpenStats,
  onOpenToday,
  onOpenFriends,
  pets,
  activePetId,
  onSelectPet,
  partnerName,
  night,
}: PetWorldHudProps) {
  const today = new Date();
  const streaks = calculateStreakStatus(events, today);
  // Still alive, but nothing logged yet today: don't let the flame read as
  // "banked" when it's actually one missed day away from resetting.
  const streakAtRisk = streaks.currentStreak > 0 && !streaks.todayQualifies;
  const condition = assessCondition(pet);

  // An ailment outranks the reaction: a message about the meal just logged must
  // not sit on top of "Miso is fading". Otherwise it's the plain feeling line.
  const feeling = condition.primary
    ? AILMENT_MESSAGE[condition.primary](pet.name)
    : (reaction?.message ?? `${pet.name} is feeling ${pet.mood}.`);

  const evolved = hasEvolved(pet);
  const dayLabel = evolved
    ? `DAY ${daysWithPet(pet, today)} · ${formLabel.toUpperCase()}`
    : `DAY ${daysWithPet(pet, today)}`;

  const showSwitcher = pets && pets.length > 1 && onSelectPet;

  return (
    // `box-none`: the HUD layer spans the whole screen and sits on top of the
    // environment's action row, so without this its empty space swallows every
    // tap meant for the buttons underneath. Its own controls stay tappable
    // because they are real press targets.
    <View style={styles.fill} pointerEvents="box-none">
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

          {/* The line people actually glance up for — a sentence, so it reads
              like one: mono, regular weight, straight on the scene (no box). */}
          <Text style={[styles.feeling, night && styles.feelingNight]} numberOfLines={2}>
            {feeling}
          </Text>
          {/* One quiet meta line: day count, then the streak as a bare
              fire+number, then the partner. */}
          <Text
            style={[styles.meta, night && styles.metaNight]}
            accessibilityLabel={
              streaks.currentStreak > 0
                ? `${dayLabel}. ${streaks.currentStreak} day streak, best ${streaks.longestStreak}` +
                  (streakAtRisk ? ', not yet logged today.' : '.')
                : undefined
            }
          >
            {dayLabel}
            {streaks.currentStreak > 0 ? (
              <Text style={[styles.metaFlame, streakAtRisk && styles.metaFlameAtRisk]}>
                {`   ·   🔥 ${streaks.currentStreak}`}
              </Text>
            ) : null}
            {partnerName ? (
              <Text style={[styles.metaSoft, night && styles.metaSoftNight]}>
                {'   ·   '}
                <Text>Raised with {partnerName}</Text>
              </Text>
            ) : null}
          </Text>
        </View>

        <View style={styles.sideRight} pointerEvents="box-none">
          {/* Account and friends as matched discs; today as a pill of the same
              height, coral-outlined so it reads as "your daily goals" rather
              than another nav button. */}
          <View style={styles.rail} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
              onPress={onOpenProfile}
              hitSlop={8}
              style={({ pressed }) => [
                retro.panel,
                night && retro.panelNight,
                styles.disc,
                pressed && retroPressed,
              ]}
            >
              <Text style={[styles.discInitial, night && retro.labelNight]}>
                {(accountInitial ?? pet.name.charAt(0)).toUpperCase()}
              </Text>
            </Pressable>

            {onOpenFriends ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open friends"
                onPress={onOpenFriends}
                hitSlop={8}
                style={({ pressed }) => [
                  retro.panel,
                  night && retro.panelNight,
                  styles.disc,
                  pressed && retroPressed,
                ]}
              >
                <Image
                  source={FRIENDS_ICON}
                  resizeMode="contain"
                  style={[styles.discIcon, { tintColor: night ? world.nightText : world.ink }]}
                />
              </Pressable>
            ) : null}

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
          </View>
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

  feeling: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: 0.2,
    color: '#241a11', // near-black warm brown — reads on the tan HUD band
    textAlign: 'center',
    marginTop: 10,
    textShadowColor: 'rgba(247,240,224,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feelingNight: { color: '#f4ecda', textShadowColor: 'rgba(0,0,0,0.55)' },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#4a3c2b',
    textAlign: 'center',
    marginTop: 5,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(247,240,224,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  metaNight: { color: '#cdbfa6', textShadowColor: 'rgba(0,0,0,0.5)' },
  metaSoft: { color: '#6e5c43', fontWeight: '400' },
  metaSoftNight: { color: '#a99a83' },
  metaFlame: { color: '#b25a35', fontWeight: '700' },
  /** Alive but not yet re-earned today — dimmed, not the same as a banked day. */
  metaFlameAtRisk: { color: '#b25a35', opacity: 0.55, fontWeight: '600' },

  rail: { alignItems: 'flex-end', gap: 12 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discInitial: { fontFamily: fonts.mono, fontSize: 19, fontWeight: '700', color: world.ink },
  discIcon: { width: 26, height: 26 },
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
