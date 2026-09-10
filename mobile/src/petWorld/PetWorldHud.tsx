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
} from '@vitto/core';
import { colors, fonts } from '../theme';
import { CareToastBanner } from './CareToastBanner';
import { LevelRing } from './LevelRing';
import { ENVIRONMENT_LABEL, type EnvironmentId } from './types';

/** The product owner's own friends glyph, tinted per day/night at render time. */
const FRIENDS_ICON = require('../../assets/buttons/freinds_button.png');

/**
 * The chrome that isn't either scene: level ring top-left, at most two status
 * chips top-center, profile/today icons top-right, and a quiet name/mood
 * caption beneath them. Persistent the same way the pet is — shown over
 * whichever environment is on screen, per the product owner's full-bleed
 * layout note (see the design-guidance message this replaced the boxed
 * "VITALS" HUD and top bar for).
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
  /** Which scene is on screen, named on the kicker line. */
  environment: EnvironmentId;
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
  partnerName?: string;
  /** Switches the caption panel and icon chrome to a dark-glass/bright-text
   * treatment so they stay legible over the night backgrounds. */
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

  return (
    // `box-none`: the HUD layer spans the whole screen and sits on top of the
    // environment's action row, so without this its empty space swallows every
    // tap meant for the buttons underneath. Its own controls (level ring,
    // profile/today icons) stay tappable because they are real press targets.
    <View style={styles.fill} pointerEvents="box-none">
      {/* Level ring left, account right — the two things that are about YOU
          rather than about the room, held in the corners the way they were
          before the right rail existed. */}
      <View style={styles.topRow}>
        <LevelRing level={pet.level} xpPct={pet.xp} onPress={onOpenStats} night={night} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          onPress={onOpenProfile}
          hitSlop={8}
          style={({ pressed }) => [styles.disc, night && styles.discNight, pressed && styles.iconPressed]}
        >
          <Text style={[styles.avatarLetter, night && styles.avatarLetterNight]}>
            {(accountInitial ?? pet.name.charAt(0)).toUpperCase()}
          </Text>
        </Pressable>
      </View>

      {/* A vertical rail of round buttons down the right edge, the way a Talking
          Tom-style pet game lines its secondary controls beside the pet rather
          than clustering them in a corner. Friends is an icon disc; TODAY keeps
          its word because it opens a whole detail page, not a setting. The
          account button is NOT here — it lives in the top-right corner, per the
          product owner. `box-none` so the gaps between buttons still pass taps
          through to the pet. */}
      <View style={styles.rightRail} pointerEvents="box-none">
        {onOpenFriends ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open friends"
            onPress={onOpenFriends}
            hitSlop={8}
            style={({ pressed }) => [styles.disc, night && styles.discNight, pressed && styles.iconPressed]}
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
            night && styles.todayButtonNight,
            pressed && styles.iconPressed,
          ]}
        >
          <Text style={[styles.todayLabel, night && styles.todayLabelNight]}>TODAY</Text>
          <Text style={[styles.todayMark, night && styles.todayMarkNight]}>›</Text>
        </Pressable>
      </View>

      {/* Which pet is on screen: yours, or the one you were invited to. Only
          shown once there are two -- a one-option switcher is noise -- and
          labelled by slot as well as by name, because the point of the switch
          is knowing which one you are looking at. The active tab is inert, the
          same rule as the room hotbar. */}
      {pets && pets.length > 1 && onSelectPet ? (
        <View style={styles.petSwitcher} pointerEvents="box-none">
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
                style={[styles.petTab, night && styles.petTabNight, selected && styles.petTabOn]}
              >
                <Text style={[styles.petTabKicker, night && styles.petTabKickerNight, selected && styles.petTabKickerOn]}>
                  {candidate.own ? 'MINE' : 'JOINT'}
                </Text>
                <Text style={[styles.petTabLabel, night && styles.petTabLabelNight, selected && styles.petTabLabelOn]}>
                  {candidate.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.caption, night && styles.captionNight]} pointerEvents="none">
        {/* The place goes on the kicker rather than in new chrome of its own:
            it belongs with the other at-a-glance facts, and the top of the
            screen has no room left for another element. */}
        <Text style={[styles.kicker, night && styles.kickerNight]}>
          {formLabel.toUpperCase()} · DAY {daysWithPet(pet, today)} ·{' '}
          {ENVIRONMENT_LABEL[environment].toUpperCase()}
        </Text>
        <Text style={[styles.petName, night && styles.petNameNight]}>{pet.name}</Text>
        {/* An ailment outranks the reaction: a message about the meal just
            logged must not sit on top of "Miso is fading". */}
        <Text style={[styles.mood, night && styles.moodNight]}>
          {condition.primary
            ? AILMENT_MESSAGE[condition.primary](pet.name)
            : (reaction?.message ?? `${pet.name} is feeling ${pet.mood}.`)}
        </Text>
        {partnerName ? (
          <Text style={[styles.partnerLine, night && styles.partnerLineNight]}>Raised with {partnerName}</Text>
        ) : null}
        {streaks.currentStreak > 0 ? (
          <Text style={[styles.streak, night && styles.streakNight]}>
            🔥 {streaks.currentStreak} day streak · best {streaks.longestStreak}
          </Text>
        ) : null}
      </View>

      {/* Under the name card and hard right, where the product owner put them:
          the top row is for controls, and a chip tray wedged between the level
          ring and the profile icons read as a third control rather than as a
          readout of what is wrong with the pet. */}
      {chips.length > 0 ? (
        <View style={styles.chips} pointerEvents="none">
          {chips.map((effect) => (
            <View
              key={effect.id}
              style={[styles.chip, effect.kind === 'buff' && styles.chipBuff, night && styles.chipNight]}
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: TOP_INSET,
  },
  // Down the right edge, beside the pet -- not pinned to the top corner.
  rightRail: {
    position: 'absolute',
    right: 12,
    top: '30%',
    alignItems: 'flex-end',
    gap: 12,
  },
  disc: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discNight: { backgroundColor: 'rgba(20,18,38,0.6)' },
  railIcon: { width: 26, height: 26 },
  // A wrapping row rather than the old vertical stack: laid out along the card's
  // bottom edge there is width to spare, and stacking pushed the second chip
  // down over the pet.
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    // Matches `caption`'s horizontal margin, so the chips line up with the right
    // edge of the card they sit beneath.
    marginHorizontal: 16,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  chipBuff: { backgroundColor: 'rgba(255,255,255,0.4)' },
  chipNight: { backgroundColor: 'rgba(20,18,38,0.55)' },
  chipLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.3, color: '#8c4433' },
  chipLabelBuff: { color: '#55705d' },
  chipLabelNight: { color: '#f7f5ff' },
  avatarLetter: { fontSize: 16, fontWeight: '700', color: colors.ink },
  avatarLetterNight: { color: '#f7f5ff' },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 5,
    borderRadius: 13,
    // Denser than the avatar's wash: this one carries text that has to stay
    // legible over a bright window or a dark night sky.
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  todayButtonNight: { backgroundColor: 'rgba(20,18,38,0.62)' },
  todayLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.inkSoft },
  todayLabelNight: { color: '#f7f5ff' },
  todayMark: { fontSize: 13, color: colors.inkSoft, fontFamily: fonts.mono },
  todayMarkNight: { color: '#f7f5ff' },
  iconPressed: { opacity: 0.7 },
  petSwitcher: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 10 },
  petTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  petTabNight: { borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(20,18,38,0.55)' },
  petTabOn: { borderColor: colors.coral, backgroundColor: 'rgba(253,241,238,0.92)' },
  petTabKicker: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.2, color: colors.muted },
  petTabKickerNight: { color: 'rgba(247,245,255,0.7)' },
  petTabKickerOn: { color: colors.coralDeep },
  petTabLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft, marginTop: 1 },
  petTabLabelNight: { color: '#f7f5ff' },
  petTabLabelOn: { color: colors.coralDeep },
  caption: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  captionNight: { backgroundColor: 'rgba(20,18,38,0.58)' },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.inkSoft,
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowRadius: 3,
  },
  kickerNight: { color: '#e4e0ff', textShadowColor: 'transparent' },
  petName: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.ink,
    letterSpacing: -0.6,
    marginTop: 4,
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowRadius: 4,
  },
  petNameNight: { color: '#ffffff', textShadowColor: 'transparent' },
  mood: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 4,
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowRadius: 3,
  },
  moodNight: { color: '#e4e0ff', textShadowColor: 'transparent' },
  partnerLine: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkSoft, marginTop: 4, letterSpacing: 0.5 },
  partnerLineNight: { color: '#e4e0ff' },
  streak: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkSoft, marginTop: 6 },
  streakNight: { color: '#e4e0ff' },
});
