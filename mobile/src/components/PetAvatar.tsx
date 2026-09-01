import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { MealAnalysis } from '../domain/health';
import { getEvolutionStage, type PetState } from '../domain/pet';
import { colors, fonts } from '../theme';

type PetActivity = 'idle' | 'analyzing' | 'eating' | 'workout' | 'exploring' | 'celebrating';

interface PetAvatarProps {
  pet: PetState;
  isAnalyzingMeal: boolean;
  isEating: boolean;
  feedingImage: string | null;
  feedingGrade: MealAnalysis['grade'] | null;
  isCelebrating: boolean;
  isWorkingOut: boolean;
  isExploring: boolean;
  children?: React.ReactNode;
}

const MOOD_MOUTH: Record<PetState['mood'], string> = {
  bright: '◡',
  content: '⌣',
  sleepy: '─',
  hungry: '○',
};

const STATUS_TEXT: Record<PetActivity, (name: string) => string> = {
  celebrating: (name) => `${name} feels great!`,
  eating: (name) => `${name} is enjoying dinner`,
  analyzing: (name) => `${name} is curious about that plate`,
  workout: (name) => `${name} is training hard`,
  exploring: (name) => `${name} is exploring`,
  idle: (name) => `${name} is here`,
};

const STAGE_SIZE = { baby: 112, teen: 144, adult: 168 } as const;

const AURA_BY_MOOD: Record<PetState['mood'], string> = {
  bright: '#c8e6cc',
  content: '#b8d3bb',
  sleepy: '#cfc4bb',
  hungry: '#e3c9a6',
};

export function PetAvatar({
  pet,
  isAnalyzingMeal,
  isEating,
  feedingImage,
  feedingGrade,
  isCelebrating,
  isWorkingOut,
  isExploring,
  children,
}: PetAvatarProps) {
  const activity: PetActivity = isCelebrating
    ? 'celebrating'
    : isEating
      ? 'eating'
      : isAnalyzingMeal
        ? 'analyzing'
        : isWorkingOut
          ? 'workout'
          : isExploring
            ? 'exploring'
            : 'idle';

  const stage = getEvolutionStage(pet.level);
  const size = STAGE_SIZE[stage];
  const sleepy = pet.mood === 'sleepy';

  // The web build ran these as CSS keyframes; Animated is the native equivalent.
  const breathe = useRef(new Animated.Value(0)).current;
  const activityValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: sleepy ? 2200 : 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: sleepy ? 2200 : 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, sleepy]);

  useEffect(() => {
    activityValue.setValue(0);
    if (activity === 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(activityValue, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(activityValue, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [activity, activityValue]);

  const faceTransform: ViewStyle['transform'] = [
    { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) as unknown as number },
    activity === 'exploring'
      ? { translateY: activityValue.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) as unknown as number }
      : { translateY: 0 },
    activity === 'workout'
      ? { scaleX: activityValue.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) as unknown as number }
      : { scaleX: 1 },
    activity === 'analyzing'
      ? {
          rotate: activityValue.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '-6deg'],
          }) as unknown as string,
        }
      : { rotate: '0deg' },
  ];

  const showHearts = isCelebrating && (feedingGrade === 'A' || feedingGrade === 'B');

  return (
    <View style={styles.stage}>
      {children}
      <View style={[styles.aura, { backgroundColor: AURA_BY_MOOD[pet.mood], width: size * 1.4, height: size * 1.4, borderRadius: size }]} />
      {feedingImage ? <Image source={{ uri: feedingImage }} style={styles.food} /> : null}

      <View style={styles.petWrap}>
        <View style={[styles.ear, styles.earLeft, { left: size * 0.06, top: -size * 0.18 }]} />
        <View style={[styles.ear, styles.earRight, { right: size * 0.06, top: -size * 0.18 }]} />
        <Animated.View
          style={[
            styles.face,
            { width: size, height: size * 0.92, transform: faceTransform },
          ]}
        >
          <View style={styles.eyes}>
            <View style={[styles.eye, sleepy && styles.eyeClosed]} />
            <View style={[styles.eye, sleepy && styles.eyeClosed]} />
          </View>
          <Text style={[styles.mouth, { fontSize: size * 0.3 }]}>
            {feedingImage ? '○' : MOOD_MOUTH[pet.mood]}
          </Text>
          {isEating ? (
            <>
              <View style={[styles.cheek, { left: size * 0.1 }]} />
              <View style={[styles.cheek, { right: size * 0.1 }]} />
            </>
          ) : null}
        </Animated.View>
      </View>

      {activity === 'analyzing' ? (
        <View style={styles.thought}>
          <Text style={styles.thoughtMark}>✣</Text>
        </View>
      ) : null}
      {activity === 'workout' || activity === 'exploring' ? (
        <View style={styles.particles} pointerEvents="none">
          <Text style={[styles.particle, { color: activity === 'workout' ? colors.coral : colors.mintDeep }]}>
            {activity === 'workout' ? '↗' : '⌁'}
          </Text>
          <Text style={[styles.particle, { color: activity === 'workout' ? colors.coral : colors.mintDeep }]}>
            {activity === 'workout' ? '↗' : '⌁'}
          </Text>
        </View>
      ) : null}
      {showHearts ? (
        <View style={styles.particles} pointerEvents="none">
          <Text style={[styles.particle, { color: colors.coral }]}>♥</Text>
          <Text style={[styles.particle, { color: colors.coral }]}>♥</Text>
        </View>
      ) : null}

      <Text style={styles.status}>
        {STATUS_TEXT[activity](pet.name)} <Text style={{ color: colors.coral }}>♥</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: 320,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  aura: { position: 'absolute', opacity: 0.65 },
  food: { position: 'absolute', top: 40, width: 84, height: 84, borderRadius: 42 },
  petWrap: { alignItems: 'center', justifyContent: 'center' },
  face: {
    backgroundColor: colors.petSkin,
    borderTopLeftRadius: 90,
    borderTopRightRadius: 90,
    borderBottomLeftRadius: 76,
    borderBottomRightRadius: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 8,
    borderBottomColor: colors.petShade,
  },
  ear: {
    position: 'absolute',
    width: 30,
    height: 46,
    backgroundColor: colors.petSkin,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  earLeft: { transform: [{ rotate: '-18deg' }] },
  earRight: { transform: [{ rotate: '18deg' }] },
  eyes: { flexDirection: 'row', gap: 34, marginBottom: 6 },
  eye: { width: 8, height: 12, borderRadius: 6, backgroundColor: colors.petInk },
  eyeClosed: { height: 3 },
  mouth: { color: colors.petInk, marginTop: -2 },
  cheek: {
    position: 'absolute',
    top: '54%',
    width: 14,
    height: 10,
    borderRadius: 7,
    backgroundColor: '#f0a48c',
  },
  thought: {
    position: 'absolute',
    top: 28,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thoughtMark: { color: colors.yellowDeep, fontSize: 16 },
  particles: {
    position: 'absolute',
    top: '30%',
    width: '70%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  particle: { fontSize: 20, fontWeight: '700' },
  status: {
    position: 'absolute',
    bottom: 20,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: '#55705d',
  },
});
