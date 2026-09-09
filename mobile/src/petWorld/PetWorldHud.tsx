import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AILMENT_MESSAGE,
  type HealthEvent,
  type PetReaction,
  type PetState,
  calculateStreaks,
  daysWithPet,
  getStatusEffects,
  assessCondition,
} from '@vitto/core';
import { colors, fonts } from '../theme';
import { LevelRing } from './LevelRing';

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
  formLabel: string;
  accountInitial?: string;
  onOpenProfile: () => void;
  onOpenStats: () => void;
  onOpenToday: () => void;
  pets?: { id: string; name: string }[];
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
  formLabel,
  accountInitial,
  onOpenProfile,
  onOpenStats,
  onOpenToday,
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
    <View style={styles.fill}>
      <View style={styles.topRow}>
        <LevelRing level={pet.level} xpPct={pet.xp} onPress={onOpenStats} />

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

        <View style={styles.iconStack}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            onPress={onOpenProfile}
            hitSlop={8}
            style={({ pressed }) => [styles.avatar, night && styles.avatarNight, pressed && styles.iconPressed]}
          >
            <Text style={[styles.avatarLetter, night && styles.avatarLetterNight]}>
              {(accountInitial ?? pet.name.charAt(0)).toUpperCase()}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open today's detail"
            onPress={onOpenToday}
            hitSlop={8}
            style={({ pressed }) => [
              styles.todayIcon,
              night && styles.todayIconNight,
              pressed && styles.iconPressed,
            ]}
          >
            <Text style={[styles.todayIconMark, night && styles.todayIconMarkNight]}>›</Text>
          </Pressable>
        </View>
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
                style={[styles.petTab, selected && styles.petTabOn]}
              >
                <Text style={[styles.petTabLabel, selected && styles.petTabLabelOn]}>{candidate.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.caption, night && styles.captionNight]} pointerEvents="none">
        <Text style={[styles.kicker, night && styles.kickerNight]}>
          {formLabel.toUpperCase()} · DAY {daysWithPet(pet, today)}
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
  chips: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 4 },
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
  iconStack: { alignItems: 'center', gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarNight: { backgroundColor: 'rgba(20,18,38,0.55)' },
  avatarLetter: { fontSize: 13, fontWeight: '700', color: colors.ink },
  avatarLetterNight: { color: '#f7f5ff' },
  todayIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayIconNight: { backgroundColor: 'rgba(20,18,38,0.45)' },
  todayIconMark: { fontSize: 15, color: colors.inkSoft, fontFamily: fonts.mono },
  todayIconMarkNight: { color: '#f7f5ff' },
  iconPressed: { opacity: 0.7 },
  petSwitcher: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 10 },
  petTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  petTabOn: { borderColor: colors.coral, backgroundColor: 'rgba(253,241,238,0.85)' },
  petTabLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft },
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
