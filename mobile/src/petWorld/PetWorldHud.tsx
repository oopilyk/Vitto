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
  pets?: { id: string; name: string }[];
  activePetId?: string | null;
  onSelectPet?: (petId: string) => void;
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

        <View style={styles.topSide} pointerEvents="box-none">
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
        </View>
      </View>

      {/* A vertical rail of round buttons down the right edge, the way a Talking
          Tom-style pet game lines its secondary controls beside the pet rather
          than clustering them in a corner. `box-none` so the gaps between
          buttons still pass taps through to the pet. */}
      <View style={styles.rightRail} pointerEvents="box-none">
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
            more that way", which is not the same as telling someone the day's
            nutrition and care detail is behind it. */}
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

      {pets && pets.length > 1 && onSelectPet ? (
        <View style={styles.petSwitcher} pointerEvents="box-none">
          {pets.map((candidate) => {
            const selected = candidate.id === (activePetId ?? pets[0].id);
            return (
              <Pressable
                key={candidate.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${candidate.name}`}
                onPress={() => onSelectPet(candidate.id)}
                style={[styles.petTab, night && styles.railDiscNight, selected && styles.petTabOn]}
              >
                <Text style={[styles.petTabLabel, selected && styles.petTabLabelOn]}>{candidate.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
const SIDE_COLUMN = 82;

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
  topSide: { width: SIDE_COLUMN, alignItems: 'flex-end' },
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#1b1830',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  streakText: { fontFamily: fonts.mono, fontSize: 13, fontWeight: '700', color: colors.ink },
  streakTextNight: { color: '#f7f5ff' },
  // Down the right edge, beside the pet -- not pinned to the top corner.
  rightRail: {
    position: 'absolute',
    right: 12,
    top: '34%',
    alignItems: 'flex-end',
    gap: 12,
  },
  railDisc: {
    width: 46,
    height: 46,
    borderRadius: 6,
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
  railIcon: { width: 24, height: 24 },
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
  avatarLetter: { fontFamily: fonts.mono, fontSize: 16, fontWeight: '700', color: colors.ink },
  avatarLetterNight: { color: '#f7f5ff' },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.ink,
    shadowColor: '#1b1830',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  todayLabel: { fontFamily: fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.ink },
  todayLabelNight: { color: '#f7f5ff' },
  todayMark: { fontSize: 13, color: colors.ink, fontFamily: fonts.mono },
  iconPressed: { opacity: 0.7, transform: [{ translateX: 1 }, { translateY: 1 }] },
  petSwitcher: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 12 },
  petTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  petTabOn: { borderColor: colors.coral, backgroundColor: colors.coralWash },
  petTabLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft },
  petTabLabelOn: { color: colors.coralDeep },
});
