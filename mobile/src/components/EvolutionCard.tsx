import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  EVOLUTION_LEVEL,
  EVOLVED_BUILDS,
  PET_BUILD_LABEL,
  canSwitchForm,
  evolutionProgress,
  getPetBuild,
  type EvolutionProgress,
  type EvolvedBuild,
  type PetState,
} from '@vitto/core';
import { SpriteFrame } from './SpriteFrame';
import { evolutionSheetFor } from './petSprites';
import { Kicker } from './ui';
import { colors, fonts, text } from '../theme';

interface Props {
  pet: PetState;
  /** Wears another form. Rows only become tappable once all three are earned. */
  onChooseForm?: (build: EvolvedBuild) => void;
}

const STAT_WORD: Record<EvolutionProgress['stat']['key'], string> = {
  endurance: 'Endurance',
  strength: 'Strength',
  mindSessions: 'Mind sessions',
};

/** What the lead is measured in, said plainly: the scholar's is its mind score. */
const LEAD_WORD: Record<EvolutionProgress['stat']['key'], string> = {
  endurance: 'Endurance',
  strength: 'Strength',
  mindSessions: 'Mind score',
};

/** What is still missing, in the order the pet will meet it. Empty once there is nothing left. */
const stillNeeded = (progress: EvolutionProgress): string[] => {
  const word = STAT_WORD[progress.stat.key];
  const needs: string[] = [];
  if (progress.level.have < progress.level.need) needs.push(`Level ${progress.level.have}/${progress.level.need}`);
  if (progress.stat.have < progress.stat.need) needs.push(`${word} ${progress.stat.have}/${progress.stat.need}`);
  if (progress.lead.have < progress.lead.need)
    needs.push(`${LEAD_WORD[progress.stat.key]} ${Math.max(0, progress.lead.have)}/${progress.lead.need} ahead of the rest`);
  return needs;
};

const SILHOUETTE = 64;

/**
 * How close the pet is to each evolution, with the evolved form as a teaser:
 * a solid silhouette until it is earned, the real thing after. Once all three
 * are earned the rows become a picker for the form the pet wears.
 */
export function EvolutionCard({ pet, onChooseForm }: Props) {
  const all = EVOLVED_BUILDS.map((build) => evolutionProgress(pet, build));
  const switchable = canSwitchForm(pet) && Boolean(onChooseForm);
  const wearing = getPetBuild(pet);
  const earnedCount = all.filter((entry) => entry.earned).length;
  const closest = all
    .filter((entry) => !entry.earned)
    .reduce<EvolutionProgress | null>((best, entry) => (!best || entry.progress > best.progress ? entry : best), null);

  const hint = switchable
    ? `All three earned. Tap a form for ${pet.name} to wear it.`
    : earnedCount > 0
      ? `Earn all three forms and ${pet.name} can switch between them.`
      : `From level ${EVOLUTION_LEVEL}, whichever you train most (workouts, cardio or mind sessions) decides who ${pet.name} becomes.`;

  return (
    <View style={styles.card} testID="evolution-card">
      <Kicker>Evolution</Kicker>
      <Text style={styles.hint}>{hint}</Text>
      {all.map((entry) => {
        const sheet = evolutionSheetFor(pet, entry.build);
        const frame = sheet.animations.idle[0]!;
        const isWorn = entry.earned && wearing === entry.build;
        const needs = stillNeeded(entry);
        const status = isWorn ? 'Wearing' : entry.earned ? (switchable ? 'Tap to wear' : 'Earned') : `${Math.round(entry.progress * 100)}%`;
        const row = (
          <View style={[styles.row, isWorn && styles.rowWorn]}>
            <View style={styles.silhouette}>
              <SpriteFrame
                sheet={sheet}
                frame={frame}
                size={SILHOUETTE}
                // Solid ink until earned: the teaser shows the shape, not the details.
                tintColor={entry.earned ? undefined : colors.inkSoft}
              />
            </View>
            <View style={styles.detail}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{entry.earned ? PET_BUILD_LABEL[entry.build] : `${PET_BUILD_LABEL[entry.build]}?`}</Text>
                {entry === closest && entry.progress > 0 ? <Text style={styles.closest}>closest</Text> : null}
                <Text style={[styles.status, entry.earned && styles.statusEarned]}>{status}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(entry.progress * 100)}%` }, entry.earned && styles.fillEarned]} />
              </View>
              {!entry.earned ? (
                <Text style={styles.needs} numberOfLines={2}>
                  {needs.length ? needs.join(' · ') : 'Ready — it happens on the next thing you log.'}
                </Text>
              ) : null}
            </View>
          </View>
        );
        return switchable && entry.earned && !isWorn ? (
          <Pressable
            key={entry.build}
            accessibilityRole="button"
            accessibilityLabel={`Wear the ${PET_BUILD_LABEL[entry.build]} form`}
            onPress={() => onChooseForm?.(entry.build)}
          >
            {row}
          </Pressable>
        ) : (
          <View key={entry.build}>{row}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
  },
  hint: { fontSize: 12, color: colors.faint, marginTop: 6, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowWorn: { borderColor: colors.mintDeep },
  silhouette: { width: SILHOUETTE, height: SILHOUETTE },
  detail: { flex: 1, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...text.heading, fontSize: 15, color: colors.ink },
  closest: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.coral,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  status: { marginLeft: 'auto', fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  statusEarned: { color: colors.mintDeep },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.hairline, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.coral },
  fillEarned: { backgroundColor: colors.mintDeep },
  needs: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint, lineHeight: 15 },
});
