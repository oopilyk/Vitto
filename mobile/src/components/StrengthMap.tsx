import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import {
  MUSCLE_GROUP_LABEL,
  STANDARD_LIFT_LABEL,
  STRENGTH_TIERS,
  convertWeightValue,
  liftScores,
  muscleRanks,
  type BodyProfile,
  type HealthEvent,
  type MuscleGroup,
} from '@vitto/core';
import { colors, fonts } from '../theme';

/** One colour per rank, Bronze -> Grand Champion; the top is the red you want to see. */
export const TIER_COLOR: readonly string[] = ['#a8693a', '#97a1ab', '#d1a01a', '#3aa99f', '#4a8fe0', '#8d58d4', '#d8343a'];

type BodyView = 'maleFront' | 'maleBack' | 'femaleFront' | 'femaleBack';

const BODY: Record<BodyView, ImageSourcePropType> = {
  maleFront: require('../../assets/body/maleFront.png'),
  maleBack: require('../../assets/body/maleBack.png'),
  femaleFront: require('../../assets/body/femaleFront.png'),
  femaleBack: require('../../assets/body/femaleBack.png'),
};

/**
 * Each view's muscle masks (white on transparent, the body's size), built by
 * scripts/buildBodyMasks.mjs. Tinted by rank and stacked over the body.
 */
const MASKS: Record<BodyView, Partial<Record<MuscleGroup, ImageSourcePropType>>> = {
  maleFront: {
    chest: require('../../assets/body/masks/maleFront-chest.png'),
    shoulders: require('../../assets/body/masks/maleFront-shoulders.png'),
    biceps: require('../../assets/body/masks/maleFront-biceps.png'),
    upperBack: require('../../assets/body/masks/maleFront-upperBack.png'),
    quads: require('../../assets/body/masks/maleFront-quads.png'),
  },
  maleBack: {
    shoulders: require('../../assets/body/masks/maleBack-shoulders.png'),
    upperBack: require('../../assets/body/masks/maleBack-upperBack.png'),
    triceps: require('../../assets/body/masks/maleBack-triceps.png'),
    lowerBack: require('../../assets/body/masks/maleBack-lowerBack.png'),
    glutes: require('../../assets/body/masks/maleBack-glutes.png'),
    hamstrings: require('../../assets/body/masks/maleBack-hamstrings.png'),
    quads: require('../../assets/body/masks/maleBack-quads.png'),
  },
  femaleFront: {
    chest: require('../../assets/body/masks/femaleFront-chest.png'),
    shoulders: require('../../assets/body/masks/femaleFront-shoulders.png'),
    biceps: require('../../assets/body/masks/femaleFront-biceps.png'),
    upperBack: require('../../assets/body/masks/femaleFront-upperBack.png'),
    quads: require('../../assets/body/masks/femaleFront-quads.png'),
  },
  femaleBack: {
    shoulders: require('../../assets/body/masks/femaleBack-shoulders.png'),
    upperBack: require('../../assets/body/masks/femaleBack-upperBack.png'),
    triceps: require('../../assets/body/masks/femaleBack-triceps.png'),
    lowerBack: require('../../assets/body/masks/femaleBack-lowerBack.png'),
    glutes: require('../../assets/body/masks/femaleBack-glutes.png'),
    hamstrings: require('../../assets/body/masks/femaleBack-hamstrings.png'),
    quads: require('../../assets/body/masks/femaleBack-quads.png'),
  },
};

/** The illustrations' own proportions (688 x 1024). */
const BODY_ASPECT = 688 / 1024;

interface Props {
  profile: Pick<BodyProfile, 'sex' | 'weightKg' | 'weightUnit'>;
  events: readonly HealthEvent[];
}

function Body({ view, ranks, label }: { view: BodyView; ranks: Record<MuscleGroup, number | null>; label: string }) {
  return (
    <View style={styles.bodyCol}>
      <View style={styles.body} accessibilityLabel={label}>
        <Image source={BODY[view]} style={styles.layer} resizeMode="contain" />
        {(Object.entries(MASKS[view]) as [MuscleGroup, ImageSourcePropType][]).map(([group, mask]) => {
          const tier = ranks[group];
          if (tier === null) return null;
          return (
            <Image
              key={group}
              source={mask}
              style={[styles.layer, styles.mask]}
              resizeMode="contain"
              tintColor={TIER_COLOR[tier]}
              testID={`muscle-${view}-${group}`}
            />
          );
        })}
      </View>
      <Text style={styles.bodyLabel}>{label}</Text>
    </View>
  );
}

/**
 * The strength map: front and back of a body (theirs, by sex) with each muscle
 * group coloured by the rank of the lifts that train it, and the lifts beneath
 * with what the next rank takes. Grey is untested, not weak: a muscle lights up
 * once one of its lifts has been logged.
 */
export function StrengthMap({ profile, events }: Props) {
  const scores = useMemo(() => liftScores(events, profile), [events, profile]);
  const ranks = useMemo(() => muscleRanks(scores), [scores]);
  const female = profile.sex === 'female';
  const unit = profile.weightUnit;
  const show = (kg: number) => Math.round(convertWeightValue(kg, 'kg', unit));
  const ranked = (Object.entries(ranks) as [MuscleGroup, number | null][]).filter(([, tier]) => tier !== null);
  const strongest = ranked.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  const [showLifts, setShowLifts] = useState(false);
  // The rank-up closest to hand, as a share of the lift: what to train next.
  const nextUp = scores
    .filter((score) => score.oneRepMaxKg !== null && score.nextTierKg !== null)
    .map((score) => ({ score, gap: (score.nextTierKg! - score.oneRepMaxKg!) / score.oneRepMaxKg! }))
    .sort((a, b) => a.gap - b.gap)[0]?.score;

  return (
    <View style={styles.wrap} testID="strength-map">
      {strongest ? (
        <Text style={styles.headline}>
          {'Strongest: '}
          <Text style={{ color: TIER_COLOR[strongest[1]!], fontWeight: '700' }}>
            {`${MUSCLE_GROUP_LABEL[strongest[0]]} · ${STRENGTH_TIERS[strongest[1]!]}`}
          </Text>
        </Text>
      ) : (
        <Text style={styles.headline}>Log a bench, squat, deadlift, press, row or curl to light up your map.</Text>
      )}

      <View style={styles.bodies}>
        <Body view={female ? 'femaleFront' : 'maleFront'} ranks={ranks} label="Front" />
        <Body view={female ? 'femaleBack' : 'maleBack'} ranks={ranks} label="Back" />
      </View>

      <View style={styles.legend}>
        {STRENGTH_TIERS.map((tier, index) => (
          <View key={tier} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: TIER_COLOR[index] }]} />
            <Text style={styles.legendText}>{tier}</Text>
          </View>
        ))}
      </View>

      {nextUp ? (
        <Text style={styles.nextUp} testID="next-rank-up">
          {'Next rank-up: '}
          <Text style={styles.nextUpLift}>{STANDARD_LIFT_LABEL[nextUp.lift]}</Text>
          {`, ${Math.max(1, show(nextUp.nextTierKg!) - show(nextUp.oneRepMaxKg!))} ${unit} to `}
          <Text style={{ color: TIER_COLOR[nextUp.tier === null ? 0 : nextUp.tier + 1], fontWeight: '700' }}>
            {STRENGTH_TIERS[nextUp.tier === null ? 0 : nextUp.tier + 1]}
          </Text>
        </Text>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => setShowLifts((open) => !open)} style={styles.toggle} testID="toggle-lifts">
        <Text style={styles.toggleLabel}>{showLifts ? 'Hide lifts' : 'Show lifts'}</Text>
        <Text style={styles.toggleMark}>{showLifts ? '−' : '+'}</Text>
      </Pressable>

      {showLifts ? (
      <View style={styles.lifts}>
        {scores.map((score) => {
          const tier = score.tier;
          const color = tier === null ? colors.border : TIER_COLOR[tier];
          return (
            <View key={score.lift} style={styles.lift} testID={`lift-${score.lift}`}>
              <View style={[styles.liftBar, { backgroundColor: color }]} />
              <View style={styles.liftText}>
                <Text style={styles.liftName}>{STANDARD_LIFT_LABEL[score.lift]}</Text>
                <Text style={styles.liftMeta}>
                  {score.oneRepMaxKg === null
                    ? 'Not logged yet'
                    : `${show(score.oneRepMaxKg)} ${unit} est. max · ${score.ratio}× bodyweight`}
                </Text>
                {score.oneRepMaxKg !== null && score.nextTierKg !== null ? (
                  <Text style={styles.liftNext}>
                    {`${Math.max(1, show(score.nextTierKg) - show(score.oneRepMaxKg))} ${unit} to ${STRENGTH_TIERS[tier === null ? 0 : tier + 1]}`}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.tierPill, { color: tier === null ? colors.faint : color, borderColor: color }]}>
                {tier === null ? (score.oneRepMaxKg === null ? '—' : 'Unranked') : STRENGTH_TIERS[tier]}
              </Text>
            </View>
          );
        })}
      </View>
      ) : null}

      {showLifts ? (
      <Text style={styles.foot}>
        Ranked by your best estimated one-rep max against your bodyweight, using published strength standards for your sex. Grey muscles are untested, not weak.
      </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  headline: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  bodies: { flexDirection: 'row', gap: 8 },
  bodyCol: { flex: 1, alignItems: 'center', gap: 4 },
  body: { width: '100%', aspectRatio: BODY_ASPECT },
  layer: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  mask: { opacity: 0.85 },
  bodyLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.faint },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.muted },
  lifts: { gap: 8 },
  lift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingRight: 12,
    overflow: 'hidden',
  },
  liftBar: { width: 4, alignSelf: 'stretch' },
  liftText: { flex: 1 },
  liftName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  liftMeta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  liftNext: { fontSize: 11, color: colors.faint, marginTop: 1 },
  tierPill: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  foot: { fontSize: 11, color: colors.faint, lineHeight: 16 },
  nextUp: { fontSize: 14, color: colors.inkSoft, textAlign: 'center' },
  nextUpLift: { fontWeight: '700', color: colors.ink },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  toggleMark: { fontSize: 16, fontWeight: '600', color: colors.muted },
});
