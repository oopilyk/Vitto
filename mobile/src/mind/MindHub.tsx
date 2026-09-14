import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type HealthEvent,
  type PetState,
  mindGamesPlayedOn,
  mindRecapForDay,
  toDateKey,
} from '@vitto/core';
import { EnvironmentBackdrop } from '../petWorld/EnvironmentBackdrop';
import { retro, retroPressed } from '../petWorld/retroStyle';
import { isNightTime } from '../petWorld/timeOfDay';
import { fonts, world } from '../theme';
import { MindGameCard, MindFeatureCard } from './MindGameCard';
import { MindTodayPanel } from './MindTodayPanel';
import { availableMindGames, featuredMindGame, isMindGamePlayed, type MindRouteHandlers } from './hub';
import { MIND_GAMES } from './registry';
import type { MindGameEntry, MindStage } from './types';

/**
 * Vitto's game room: everything the Mind section can play, visible and one tap
 * from playing, with a light line about what today has already come to.
 *
 * Not a statistics screen. The summary is three figures and it is the only
 * backwards-looking thing here — the rest of the page is the roster.
 *
 * The scene is the study, the same room the world's "Train mind" button is
 * pressed in and the same art Pet Jeopardy plays over. Borrowing it rather than
 * drawing new art is the point: walking from the study into the game room into
 * a game should feel like staying in one place.
 */

const STUDY_BG_DAY = require('../../assets/environments/study-day.png');
const STUDY_BG_NIGHT = require('../../assets/environments/study-night.png');

/** The art's own top-edge tone, as `StudyEnvironment` declares it — see `EnvironmentBackdrop`. */
const DAY_TINT = '#8b6f56';
const NIGHT_TINT = '#513b42';

interface Props {
  pet: PetState;
  /** The same event log the rest of the app holds — the only source of "today". */
  events: HealthEvent[];
  /** Which of the games that own a route can be opened from here. */
  routes: MindRouteHandlers;
  onStartStage: (stage: MindStage) => void;
  onClose: () => void;
}

export function MindHub({ pet, events, routes, onStartStage, onClose }: Props) {
  const night = isNightTime();

  const { today, playedToday, featured, rest } = useMemo(() => {
    const day = new Date();
    const played = mindGamesPlayedOn(events, day);
    const games = availableMindGames(MIND_GAMES, routes);
    const feature = featuredMindGame(games, toDateKey(day), played);
    return {
      today: mindRecapForDay(events, day),
      playedToday: played,
      featured: feature,
      // The feature is not repeated in the list below it: one game, one card.
      rest: games.filter((game) => game !== feature),
    };
  }, [events, routes]);

  const launch = (game: MindGameEntry) => {
    if (game.launch.kind === 'stage') {
      onStartStage(game.launch.stage);
      return;
    }
    routes[game.launch.route]?.();
  };

  return (
    <View style={[styles.screen, night && styles.screenNight]}>
      <EnvironmentBackdrop source={night ? STUDY_BG_NIGHT : STUDY_BG_DAY} />

      <View style={styles.bar}>
        <View style={styles.barText}>
          <Text style={styles.title}>Mind</Text>
          <Text style={styles.flavour} numberOfLines={2}>
            {pet.name}’s game room — pick something to think about.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Mind"
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && retroPressed]}
        >
          <Text style={styles.closeMark}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <MindTodayPanel pet={pet} today={today} night={night} />

        {featured ? (
          <View style={styles.feature}>
            <MindFeatureCard
              game={featured}
              playedToday={isMindGamePlayed(featured, playedToday)}
              night={night}
              onPress={() => launch(featured)}
            />
          </View>
        ) : null}

        {rest.length > 0 ? <Text style={styles.section}>Today’s games</Text> : null}
        {rest.map((game) => (
          <View key={game.id} style={styles.card}>
            <MindGameCard
              game={game}
              playedToday={isMindGamePlayed(game, playedToday)}
              night={night}
              onPress={() => launch(game)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DAY_TINT },
  screenNight: { backgroundColor: NIGHT_TINT },

  // The pet world's translucent strip, pinned to the top edge — the same bar
  // Pet Jeopardy and the hotbar use, so the room shows through it. Always the
  // dark scrim, day or night, which is why the type on it is always cream.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: world.barDay,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: world.barHairline,
  },
  barText: { flexShrink: 1 },
  title: {
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: world.nightText,
    marginBottom: 4,
  },
  flavour: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 15, color: world.nightTextSoft },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: world.nightSurfaceSoft,
    borderWidth: 1,
    borderColor: world.barHairline,
  },
  closeMark: { fontFamily: fonts.mono, fontSize: 15, fontWeight: '700', color: world.nightText },

  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 56 },
  feature: { marginTop: 18 },
  // Sits straight on the art rather than on a panel, so it is always the cream
  // highlight — the same reason the bar's type is, and it is never ink-on-art.
  section: { ...retro.kicker, color: world.nightText, marginTop: 26, marginBottom: 12 },
  card: { marginBottom: 12 },
});
