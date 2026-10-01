import { forwardRef, useRef } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  AILMENT_MESSAGE,
  PET_BUILD_LABEL,
  assessCondition,
  bondFor,
  calculateStreakStatus,
  daysWithPet,
  getPetBuild,
  hasEvolved,
  petVoice,
  type HealthEvent,
  type PetState,
} from '@vitto/core';
import { SpriteFrame } from './SpriteFrame';
import { sheetForPet } from './petSprites';
import { isNightTime } from '../petWorld/timeOfDay';
import { colors, fonts, themedStyles } from '../theme';

/**
 * The pet, as one image worth sending to somebody.
 *
 * 3:4, which is the environment art's own ratio (so the scene is never cropped)
 * and the shape iMessage and Instagram both show whole. Laid out in logical
 * points and captured at `SHARE_CARD_SCALE` by `shareCard.ts`, so what is
 * previewed on screen is exactly what gets sent.
 *
 * The line the pet says is the point of the card. It is the same voice the HUD
 * plaque uses — condition first, then bond, then temperament — so two people's
 * cards read as two different animals rather than the same template twice.
 */

export const SHARE_CARD_WIDTH = 330;
export const SHARE_CARD_HEIGHT = 440;
/** How far up the card the scrim reaches; it is fully clear at its top. */
const SCRIM_HEIGHT = Math.round(SHARE_CARD_HEIGHT * 0.6);
/** Captured at 3x, giving a 990x1320 PNG — sharp on any phone, and small enough to text. */
export const SHARE_CARD_SCALE = 3;

const BACKDROPS = {
  day: require('../../assets/environments/main-day.png'),
  night: require('../../assets/environments/main-night.png'),
};

export interface PetShareCardProps {
  pet: PetState;
  events: readonly HealthEvent[];
  /** Fires once every image has painted. Capturing before this yields a blank card. */
  onReady?: () => void;
  now?: Date;
}

/** How the pet says its mood, first person. MOOD_WORD reads "Blue is ..."; "I'm feeling doing fine" does not. */
const MOOD_LINE: Record<PetState['mood'], string> = {
  bright: "I'm feeling happy.",
  content: "I'm doing fine.",
  sleepy: "I'm feeling sleepy.",
  hungry: "I'm hungry.",
};

/**
 * What the pet says on the card. The plaque's own precedence: an ailment speaks
 * over everything, otherwise it is simply how the pet feels, and either way it
 * comes out in this pet's voice.
 */
export const shareCardLine = (pet: PetState, events: readonly HealthEvent[], now: Date): string => {
  const condition = assessCondition(pet);
  const base = condition.primary
    ? AILMENT_MESSAGE[condition.primary](pet.name, { canLogSleep: true })
    : MOOD_LINE[pet.mood];
  return petVoice(base, {
    personality: pet.personality,
    ailments: condition.ailments,
    bond: bondFor(events, now, { adoptedAt: pet.adoptedAt }).stage,
  });
};

export const PetShareCard = forwardRef<View, PetShareCardProps>(function PetShareCard(
  { pet, events, onReady, now = new Date() },
  ref,
) {
  // Two images have to be on screen before the card can be captured; a capture
  // taken early gets a blank backdrop or a missing pet. A ref, not state: the
  // count changes nothing on screen, and a re-render mid-capture is the last
  // thing this view wants.
  const painted = useRef(0);
  const arrived = () => {
    painted.current += 1;
    if (painted.current === 2) onReady?.();
  };

  const sheet = sheetForPet(pet);
  const night = isNightTime(now);
  const streak = calculateStreakStatus(events as HealthEvent[], now).currentStreak;
  const day = daysWithPet(pet, now);
  const build = hasEvolved(pet) ? PET_BUILD_LABEL[getPetBuild(pet)] : null;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Image
        source={night ? BACKDROPS.night : BACKDROPS.day}
        style={styles.backdrop}
        resizeMode="cover"
        onLoad={arrived}
        onError={arrived}
      />
      {/* Darkens the art under the panel so white type holds on any scene. A
          gradient, not a box: it fades in from nothing, so there is no edge
          cutting across the room or the pet. */}
      <Svg style={styles.scrim} width={SHARE_CARD_WIDTH} height={SCRIM_HEIGHT} pointerEvents="none">
        <Defs>
          <LinearGradient id="shareScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#101412" stopOpacity="0" />
            <Stop offset="0.45" stopColor="#101412" stopOpacity="0.45" />
            <Stop offset="1" stopColor="#101412" stopOpacity="0.82" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={SHARE_CARD_WIDTH} height={SCRIM_HEIGHT} fill="url(#shareScrim)" />
      </Svg>

      <View style={styles.pet}>
        <SpriteFrame sheet={sheet} frame={sheet.animations.idle[0]!} size={176} onLoad={arrived} />
      </View>

      <View style={styles.footer}>
        <View style={styles.headline}>
          <Text style={styles.name} numberOfLines={1}>{pet.name}</Text>
          <View style={styles.level}>
            <Text style={styles.levelLabel}>LV</Text>
            <Text style={styles.levelValue}>{pet.level}</Text>
          </View>
        </View>

        <Text style={styles.meta} numberOfLines={1}>
          {[`Day ${day}`, build, streak >= 2 ? `${streak} day streak` : null].filter(Boolean).join('  ·  ')}
        </Text>

        <Text style={styles.line} numberOfLines={3}>“{shareCardLine(pet, events, now)}”</Text>
      </View>

      <Text style={styles.wordmark}>VITTO</Text>
    </View>
  );
});

const styles = themedStyles(() => ({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, bottom: 0 },
  // The pet stands on the floor line of the art, above the panel.
  pet: { position: 'absolute', left: 0, right: 0, bottom: 150, alignItems: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 18 },
  headline: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  name: { flex: 1, fontFamily: fonts.display, fontSize: 30, color: '#fff', letterSpacing: -0.6 },
  level: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  levelLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.65)' },
  levelValue: { fontFamily: fonts.mono, fontSize: 22, fontWeight: '700', color: colors.coral },
  meta: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.6, color: 'rgba(255,255,255,0.7)', marginTop: 5 },
  line: { fontSize: 14, lineHeight: 20, color: '#fff', marginTop: 10 },
  wordmark: {
    position: 'absolute',
    top: 16,
    left: 20,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: 'rgba(255,255,255,0.85)',
  },
}));
