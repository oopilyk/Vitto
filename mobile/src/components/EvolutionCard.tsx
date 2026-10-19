import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  EVOLUTION_LEVEL,
  EVOLVED_BUILDS,
  PET_BUILD_LABEL,
  canSwitchForm,
  evolutionProgress,
  wornForm,
  type EvolutionProgress,
  type PetForm,
  type PetState,
} from '@vitto/core';
import { SpriteFrame } from './SpriteFrame';
import { evolutionSheetFor, portraitFrame } from './petSprites';
import { Kicker } from './ui';
import { colors, fonts, text, themedStyles } from '../theme';

interface Props {
  pet: PetState;
  /** Wears another form: the base look, or any evolution already earned. */
  onChooseForm?: (form: PetForm) => void;
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
 * The pet's forms, as skins: its base look (always its own) and each
 * evolution, with the evolved form as a teaser -- a solid silhouette until it
 * is earned, with what is left to earn it, the real thing after. Once anything
 * is earned the unlocked rows become a picker for the form the pet wears.
 */
export function EvolutionCard({ pet, onChooseForm }: Props) {
  const all = EVOLVED_BUILDS.map((build) => evolutionProgress(pet, build));
  const switchable = canSwitchForm(pet) && Boolean(onChooseForm);
  const wearing = wornForm(pet);
  const earnedCount = all.filter((entry) => entry.earned).length;
  const closest = all
    .filter((entry) => !entry.earned)
    .reduce<EvolutionProgress | null>((best, entry) => (!best || entry.progress > best.progress ? entry : best), null);

  const hint = switchable
    ? `Tap a form for ${pet.name} to wear it, base included. Locked ones unlock as ${pet.name} evolves.`
    : earnedCount > 0
      ? `${pet.name} has evolved. Every form earned stays unlocked.`
      : `From level ${EVOLUTION_LEVEL}, whichever you train most (workouts, cardio or mind sessions) decides who ${pet.name} becomes.`;

  /** One skin: tappable when it is unlocked, not worn, and there is a picker. */
  const skin = (form: PetForm, row: (isWorn: boolean) => ReactNode, unlocked: boolean) => {
    const isWorn = unlocked && wearing === form;
    const label = form === 'base' ? 'Base' : PET_BUILD_LABEL[form];
    return switchable && unlocked && !isWorn ? (
      <Pressable
        key={form}
        accessibilityRole="button"
        accessibilityLabel={`Wear the ${label} form`}
        onPress={() => onChooseForm?.(form)}
        testID={`form-${form}`}
      >
        {row(false)}
      </Pressable>
    ) : (
      <View key={form} testID={`form-${form}`}>
        {row(isWorn)}
      </View>
    );
  };

  const baseSheet = evolutionSheetFor(pet, 'balanced');

  return (
    <View style={styles.card} testID="evolution-card">
      <Kicker>Forms</Kicker>
      <Text style={styles.hint}>{hint}</Text>
      {skin(
        'base',
        (isWorn) => (
          <View style={[styles.row, isWorn && styles.rowWorn]}>
            <View style={styles.silhouette}>
              <SpriteFrame sheet={baseSheet} frame={portraitFrame(baseSheet)} size={SILHOUETTE} />
            </View>
            <View style={styles.detail}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Base</Text>
                <Text style={[styles.status, styles.statusEarned]}>
                  {isWorn ? 'Wearing' : switchable ? 'Tap to wear' : 'Unlocked'}
                </Text>
              </View>
              <Text style={styles.needs}>{`Always ${pet.name}'s to wear.`}</Text>
            </View>
          </View>
        ),
        true,
      )}
      {all.map((entry) => {
        const sheet = evolutionSheetFor(pet, entry.build);
        const frame = portraitFrame(sheet);
        const needs = stillNeeded(entry);
        return skin(
          entry.build,
          (isWorn) => (
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
                  <Text style={[styles.status, entry.earned && styles.statusEarned]}>
                    {isWorn
                      ? 'Wearing'
                      : entry.earned
                        ? switchable ? 'Tap to wear' : 'Earned'
                        : `Locked · ${Math.round(entry.progress * 100)}%`}
                  </Text>
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
          ),
          entry.earned,
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
    padding: 18,
  },
  hint: { fontFamily: fonts.pixel, fontSize: 16, color: colors.faint, marginTop: 6, lineHeight: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 10,
    borderRadius: 4,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowWorn: { borderColor: colors.mintDeep },
  silhouette: { width: SILHOUETTE, height: SILHOUETTE },
  detail: { flex: 1, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...text.heading, fontSize: 20, color: colors.ink },
  closest: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: colors.coral,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  status: { marginLeft: 'auto', fontFamily: fonts.pixel, fontSize: 16, color: colors.muted },
  statusEarned: { color: colors.mintDeep },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.hairline, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.coral },
  fillEarned: { backgroundColor: colors.mintDeep },
  needs: { fontFamily: fonts.pixel, fontSize: 14, color: colors.faint, lineHeight: 20 },
}));
