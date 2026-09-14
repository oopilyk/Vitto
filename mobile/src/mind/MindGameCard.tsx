import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MindCategory, MindGameEntry } from './types';
import { retro, retroPressed } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';

/**
 * The two card treatments the Mind hub renders its roster with. Both are pure
 * presentation over a `MindGameEntry` — neither one recomputes a number the
 * entry doesn't already carry (see `registry.ts`'s `maxXpFor` for where those
 * numbers come from).
 *
 * `MindGameCard` is the roster row every other game gets; `MindFeatureCard` is
 * the same information given more room for the one game the hub calls out as
 * "today's feature". They share the category accent, the reward line and the
 * played-today marker so the two never drift apart.
 */

export interface MindGameCardProps {
  game: MindGameEntry;
  playedToday: boolean;
  night: boolean;
  onPress: () => void;
}

/** One of the palette's three tones per category — never a new colour. */
const ACCENT_BY_CATEGORY: Record<MindCategory, string> = {
  TRIVIA: world.accent,
  MEMORY: world.positive,
  WORDS: world.inkSoft,
  LOGIC: world.accent,
  GEOGRAPHY: world.positive,
  REACTION: world.accent,
};

const rewardLine = (game: MindGameEntry): string =>
  game.hasPoints ? `UP TO ${game.maxXp} XP · + MIND POINTS` : `UP TO ${game.maxXp} XP`;

const minutesLine = (game: MindGameEntry): string => `~${game.minutes} MIN`;

/**
 * Sage, day and night alike: the same "this went well" colour the pet world
 * uses for a positive state, and it stays legible on both panel tones. A played
 * game is still playable — this marks a thing done, it does not lock anything.
 */
function PlayedMark() {
  return (
    <Text style={styles.playedMark} numberOfLines={1}>
      ✓ PLAYED TODAY
    </Text>
  );
}

export function MindGameCard({ game, playedToday, night, onPress }: MindGameCardProps) {
  const accent = ACCENT_BY_CATEGORY[game.category];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${game.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        retro.panel,
        night && retro.panelNight,
        playedToday && styles.cardPlayed,
        pressed && retroPressed,
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.category, { color: accent }]} numberOfLines={1}>
          {game.category}
        </Text>
        {playedToday ? <PlayedMark /> : null}
      </View>
      <Text style={[styles.name, night && styles.nameNight]} numberOfLines={1}>
        {game.name}
      </Text>
      <Text style={[retro.caption, night && retro.captionNight, styles.blurb]} numberOfLines={2}>
        {game.blurb}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={[retro.caption, night && retro.captionNight]} numberOfLines={1}>
          {minutesLine(game)} · {rewardLine(game)}
        </Text>
        <Text style={[styles.playLabel, { color: night ? world.nightAccent : world.accentDeep }]}>
          PLAY →
        </Text>
      </View>
    </Pressable>
  );
}

export function MindFeatureCard({ game, playedToday, night, onPress }: MindGameCardProps) {
  const accent = ACCENT_BY_CATEGORY[game.category];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${game.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.featureCard,
        retro.panel,
        night && retro.panelNight,
        playedToday && styles.cardPlayed,
        pressed && retroPressed,
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.kicker, night && styles.kickerNight]}>TODAY'S FEATURE</Text>
        {playedToday ? <PlayedMark /> : null}
      </View>
      <Text style={[styles.featureName, night && styles.featureNameNight]} numberOfLines={2}>
        {game.name}
      </Text>
      <Text style={[retro.caption, night && retro.captionNight, styles.featureBlurb]} numberOfLines={1}>
        {game.blurb}
      </Text>
      <View style={styles.featureFooter}>
        <Text style={[styles.featureCategory, { color: accent }]} numberOfLines={1}>
          {game.category}
        </Text>
        <Text style={[retro.caption, night && retro.captionNight]}>{minutesLine(game)}</Text>
        <Text style={[styles.reward, night && styles.rewardNight, styles.featureReward]} numberOfLines={1}>
          {rewardLine(game)}
        </Text>
      </View>
      <View style={[styles.playBar, { borderColor: night ? world.nightAccent : world.accentDeep }]}>
        <Text style={[styles.playBarLabel, { color: night ? world.nightAccent : world.accentDeep }]}>
          PLAY NOW
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardPlayed: { opacity: 0.86 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  category: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  playedMark: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: world.positive,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: world.ink,
    marginTop: 6,
  },
  nameNight: { color: world.nightText },
  blurb: { marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  reward: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: world.inkSoft,
  },
  rewardNight: { color: world.nightTextSoft },
  playLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  featureCard: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: world.accentDeep,
    textTransform: 'uppercase',
  },
  kickerNight: { color: world.nightAccent },
  featureName: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: world.ink,
    marginTop: 10,
  },
  featureNameNight: { color: world.nightText },
  featureBlurb: { marginTop: 6 },
  featureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  featureCategory: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  featureReward: { fontSize: 11 },
  playBar: {
    marginTop: 16,
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
  },
  playBarLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
});
