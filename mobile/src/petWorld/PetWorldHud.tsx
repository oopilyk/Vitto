import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AILMENT_MESSAGE,
  type CareToast,
  type HealthEvent,
  type PetReaction,
  type PetState,
  calculateStreaks,
  daysWithPet,
  getStatusEffects,
  assessCondition,
  hasEvolved,
} from '@vitto/core';
import { colors, fonts } from '../theme';
import { CareToastBanner } from './CareToastBanner';
import { LevelRing } from './LevelRing';
import { retro } from './retroStyle';
import { ENVIRONMENT_LABEL, type EnvironmentId } from './types';

/** The product owner's own friends glyph, tinted per day/night at render time. */
const FRIENDS_ICON = require('../../assets/buttons/freinds_button.png');

/**
 * The chrome that isn't either scene, in a retro / pixel-UI dressing:
 *
 * - a big level ring top-left (the loudest element, per the product owner);
 * - the room name on a retro plate dead centre, with a small
 *   "<pet> is feeling <mood>" line under it;
 * - the streak as a bare `🔥 n` chip top-right;
 * - a rail of profile / friends / today buttons down the right edge.
 *
 * The pet's *name* deliberately does not live here any more — it pops up in a
 * hover/tap bubble over the pet itself (see `PetNameBubble`), replacing the
 * boxed name card this used to show.
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
  /** Which scene is on screen, named on the centre plate. */
  environment: EnvironmentId;
  /** "Level 4", or the evolved build name once the pet has evolved. Only shown
   * on the meta line while evolved — before that it just repeats the ring. */
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
  /** `own` marks the adopted pet; the other one is the joint pet. */
  pets?: { id: string; name: string; own?: boolean }[];
  activePetId?: string | null;
  onSelectPet?: (petId: string) => void;
  /**
   * Opens the join-by-code flow. Passed only while the joint slot is free and
   * the account is online, which is exactly when the "+" tile under the level
   * ring should exist; once a second pet arrives that tile becomes the switcher.
   */
  onAddJointPet?: () => void;
  partnerName?: string;
  /** Switches the chrome to a dark-glass/bright-text treatment so it stays
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
  onAddJointPet,
  partnerName,
  night,
}: PetWorldHudProps) {
  const today = new Date();
  const streaks = calculateStreaks(events, today);
  const condition = assessCondition(pet);
  // Worst two only — this is a glance, not the full stat sheet, which is what
  // the ring's tap target is for.
  const chips = getStatusEffects(pet).slice(0, 2);

  // An ailment outranks the reaction: a message about the meal just logged must
  // not sit on top of "Miso is fading". Otherwise it's the plain feeling line
  // the product owner asked for.
  const feeling = condition.primary
    ? AILMENT_MESSAGE[condition.primary](pet.name)
    : (reaction?.message ?? `${pet.name} is feeling ${pet.mood}.`);

  const evolved = hasEvolved(pet);
  const dayLabel = `DAY ${daysWithPet(pet, today)}`;
  const meta = evolved ? `${dayLabel} · ${formLabel.toUpperCase()}` : dayLabel;

  return (
    // `box-none`: the HUD layer spans the whole screen and sits on top of the
    // environment's action row, so without this its empty space swallows every
    // tap meant for the buttons underneath. Its own controls stay tappable
    // because they are real press targets.
    <View style={styles.fill} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.topSideLeft}>
          <LevelRing level={pet.level} xpPct={pet.xp} onPress={onOpenStats} night={night} />

          {/* One slot, two states, directly under the ring. With a single pet
              it is a "+" tile that starts the join-by-code flow; once the
              joint pet arrives the same slot becomes the switcher. Same place
              either way, so the eye learns where "the other pet" lives before
              there is one. The active tab is inert, like the room hotbar. */}
          {pets && pets.length > 1 && onSelectPet ? (
            <View style={styles.slotColumn} pointerEvents="box-none">
              {pets.map((candidate) => {
                const selected = candidate.id === (activePetId ?? pets[0].id);
                return (
                  <Pressable
                    key={candidate.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: selected }}
                    accessibilityLabel={`Show ${candidate.name}, your ${candidate.own ? 'own' : 'joint'} pet`}
                    disabled={selected}
                    onPress={() => onSelectPet(candidate.id)}
                    style={[styles.petTab, night && styles.railDiscNight, selected && styles.petTabOn]}
                  >
                    <Text style={[styles.petTabKicker, night && styles.petTabKickerNight, selected && styles.petTabKickerOn]}>
                      {candidate.own ? 'MINE' : 'JOINT'}
                    </Text>
                    <Text
                      style={[styles.petTabLabel, night && styles.petTabLabelNight, selected && styles.petTabLabelOn]}
                      numberOfLines={1}
                    >
                      {candidate.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : onAddJointPet ? (
            <View style={styles.slotColumn} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a joint pet"
                onPress={onAddJointPet}
                hitSlop={6}
                style={({ pressed }) => [
                  retro.panel,
                  night && retro.panelNight,
                  styles.addTile,
                  pressed && styles.iconPressed,
                ]}
              >
                <Text style={[styles.addPlus, night && styles.addPlusNight]}>+</Text>
                <Text style={[retro.label, night && retro.labelNight, styles.addLabel]}>JOINT PET</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.topCenter} pointerEvents="none">
          <View style={[retro.panel, night && retro.panelNight, styles.roomPlate]}>
            <Text style={[retro.label, night && retro.labelNight, styles.roomLabel]}>
              {ENVIRONMENT_LABEL[environment].toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.feeling, night && styles.feelingNight]}>{feeling}</Text>
          <Text style={[retro.subtle, night && retro.subtleNight, styles.meta]}>{meta}</Text>
          {partnerName ? (
            <Text style={[retro.subtle, night && retro.subtleNight, styles.meta]}>
              Raised with {partnerName}
            </Text>
          ) : null}
        </View>

        {/* Right column: the streak chip, then the secondary-control rail
            stacked directly beneath it, per the product owner's "put them below
            the streak button" note. `box-none` so the gaps between buttons
            still pass taps through to the pet. */}
        <View style={styles.topRight} pointerEvents="box-none">
          {streaks.currentStreak > 0 ? (
            <View
              style={[styles.streakChip, night && retro.panelNight]}
              accessible
              accessibilityLabel={`${streaks.currentStreak} day streak, best ${streaks.longestStreak}`}
            >
              <Text style={[styles.streakText, night && styles.streakTextNight]}>
                🔥 {streaks.currentStreak}
              </Text>
            </View>
          ) : null}

          <View style={styles.rail} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
              onPress={onOpenProfile}
              hitSlop={8}
              style={({ pressed }) => [styles.railDisc, night && styles.railDiscNight, pressed && styles.iconPressed]}
            >
              <Text style={[styles.avatarLetter, night && styles.avatarLetterNight]}>
                {(accountInitial ?? pet.name.charAt(0)).toUpperCase()}
              </Text>
            </Pressable>

            {onOpenFriends ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open friends"
                onPress={onOpenFriends}
                hitSlop={8}
                style={({ pressed }) => [styles.railDisc, night && styles.railDiscNight, pressed && styles.iconPressed]}
              >
                <Image
                  source={FRIENDS_ICON}
                  resizeMode="contain"
                  style={[styles.railIcon, { tintColor: night ? '#f7f5ff' : colors.ink }]}
                />
              </Pressable>
            ) : null}

            {/* Labelled, not a bare chevron: an arrow alone said only "there is
                more that way", which is not the same as telling someone the
                day's nutrition and care detail is behind it. Kept a rectangle
                while the others are discs, per the product owner. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open today's detail"
              onPress={onOpenToday}
              hitSlop={8}
              style={({ pressed }) => [
                styles.todayButton,
                night && styles.railDiscNight,
                pressed && styles.iconPressed,
              ]}
            >
              <Text style={[styles.todayLabel, night && styles.todayLabelNight]}>TODAY</Text>
              <Text style={[styles.todayMark, night && styles.todayLabelNight]}>›</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Under the top row and hard right — a readout of what is wrong with the
          pet, not a third control. */}
      {chips.length > 0 ? (
        <View style={styles.chips} pointerEvents="none">
          {chips.map((effect) => (
            <View
              key={effect.id}
              style={[
                styles.chip,
                night && retro.panelNight,
                effect.kind === 'buff' && styles.chipBuff,
              ]}
              accessible
              accessibilityLabel={`${effect.label}. ${effect.detail}`}
            >
              <Text
                style={[
                  styles.chipLabel,
                  effect.kind === 'buff' && styles.chipLabelBuff,
                  night && styles.chipLabelNight,
                ]}
              >
                {effect.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <CareToastBanner toast={careToast} night={night} />
    </View>
  );
}

/** How far the top row sits from the very top edge — clears the notch/status
 * bar now that there is no boxed top bar reserving that space itself. */
const TOP_INSET = 58;

/** The level ring's footprint — the side columns match it so the centre plate
 * lands on the true screen centre, not offset by a wider ring. */
const SIDE_COLUMN = 92;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: TOP_INSET,
  },
  topSideLeft: { width: SIDE_COLUMN, alignItems: 'flex-start' },
  topRight: { width: SIDE_COLUMN, alignItems: 'flex-end' },
  topCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  roomPlate: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roomLabel: { fontSize: 12 },
  feeling: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.3,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 7,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowRadius: 3,
  },
  feelingNight: { color: '#f2efff', textShadowColor: 'rgba(0,0,0,0.35)' },
  meta: {
    fontSize: 9,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  streakChip: {
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    shadowColor: '#1b1830',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  streakText: { fontFamily: fonts.mono, fontSize: 16, fontWeight: '700', color: colors.ink },
  streakTextNight: { color: '#f7f5ff' },
  // Stacked directly under the streak chip in the top-right column.
  rail: {
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  railDisc: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1b1830',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  railDiscNight: { backgroundColor: '#141226', borderColor: '#4b4870' },
  railIcon: { width: 28, height: 28 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  chipBuff: { borderColor: colors.mintDeep },
  chipLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.3, color: '#8c4433' },
  chipLabelBuff: { color: colors.mintDeep },
  chipLabelNight: { color: '#f7f5ff' },
  avatarLetter: { fontFamily: fonts.mono, fontSize: 20, fontWeight: '700', color: colors.ink },
  avatarLetterNight: { color: '#f7f5ff' },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 13,
    paddingRight: 10,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.ink,
    shadowColor: '#1b1830',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  todayLabel: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.ink },
  todayLabelNight: { color: '#f7f5ff' },
  todayMark: { fontSize: 16, color: colors.ink, fontFamily: fonts.mono },
  iconPressed: { opacity: 0.7, transform: [{ translateX: 1 }, { translateY: 1 }] },
  // Stacked under the level ring and as wide as its column, so the two tabs
  // (or the "+" tile) read as part of the ring's own stack rather than as a
  // strip floating over the room.
  slotColumn: { marginTop: 10, gap: 6, width: SIDE_COLUMN, alignItems: 'stretch' },
  petTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  addTile: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: { fontFamily: fonts.mono, fontSize: 26, lineHeight: 28, fontWeight: '700', color: colors.ink },
  addPlusNight: { color: '#f7f5ff' },
  addLabel: { fontSize: 9, marginTop: 2 },
  petTabOn: { borderColor: colors.coral, backgroundColor: colors.coralWash },
  // The slot kicker (MINE / JOINT) above the name — the reason the switch exists.
  petTabKicker: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.2, color: colors.muted },
  petTabKickerNight: { color: 'rgba(247,245,255,0.7)' },
  petTabKickerOn: { color: colors.coralDeep },
  petTabLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft, marginTop: 1 },
  petTabLabelNight: { color: '#f7f5ff' },
  petTabLabelOn: { color: colors.coralDeep },
});
