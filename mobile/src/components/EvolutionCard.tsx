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
import { t } from '../i18n';
import { colors, fonts, text, themedStyles } from '../theme';

interface Props {
  pet: PetState;
  /** Wears another form: the base look, or any evolution already earned. */
  onChooseForm?: (form: PetForm) => void;
}

const STAT_WORD: Record<EvolutionProgress['stat']['key'], string> = {
  endurance: t('Endurance'),
  strength: t('Strength'),
  mindSessions: t('Mind sessions'),
};

/** What the lead is measured in, said plainly: the scholar's is its mind score. */
const LEAD_WORD: Record<EvolutionProgress['stat']['key'], string> = {
  endurance: t('Endurance'),
  strength: t('Strength'),
  mindSessions: t('Mind score'),
};

/** What is still missing, in the order the pet will meet it. Empty once there is nothing left. */
const stillNeeded = (progress: EvolutionProgress): string[] => {
  const word = STAT_WORD[progress.stat.key];
  const needs: string[] = [];
  if (progress.level.have < progress.level.need) needs.push(t('Level {have}/{need}', { have: progress.level.have, need: progress.level.need }));
  if (progress.stat.have < progress.stat.need) needs.push(t('{stat} {have}/{need}', { stat: word, have: progress.stat.have, need: progress.stat.need }));
  if (progress.lead.have < progress.lead.need)
    needs.push(t('{stat} {have}/{need} ahead of the rest', { stat: LEAD_WORD[progress.stat.key], have: Math.max(0, progress.lead.have), need: progress.lead.need }));
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

  // Only before the first form: how evolving works. After it, each form says
  // for itself whether it can be worn ("Tap to wear", "Wearing").
  const hint =
    switchable || earnedCount > 0
      ? null
      : t('From level {level}, whichever you train most (workouts, cardio or mind sessions) decides who {pet} becomes.', { level: EVOLUTION_LEVEL, pet: pet.name });

  /** One skin: tappable when it is unlocked, not worn, and there is a picker. */
  const skin = (form: PetForm, row: (isWorn: boolean) => ReactNode, unlocked: boolean) => {
    const isWorn = unlocked && wearing === form;
    const label = form === 'base' ? t('Base') : t(PET_BUILD_LABEL[form]);
    return switchable && unlocked && !isWorn ? (
      <Pressable
        key={form}
        accessibilityRole="button"
        accessibilityLabel={t('Wear the {form} form', { form: label })}
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
      <Kicker>{t('Forms')}</Kicker>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {skin(
        'base',
        (isWorn) => (
          <View style={[styles.row, isWorn && styles.rowWorn]}>
            <View style={styles.silhouette}>
              <SpriteFrame sheet={baseSheet} frame={portraitFrame(baseSheet)} size={SILHOUETTE} />
            </View>
            <View style={styles.detail}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {t('Base')}
                </Text>
                <Text style={[styles.status, styles.statusEarned]} numberOfLines={1}>
                  {isWorn ? t('Wearing') : switchable ? t('Tap to wear') : t('Unlocked')}
                </Text>
              </View>
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
                  <Text style={styles.title} numberOfLines={1}>
                    {entry.earned ? t(PET_BUILD_LABEL[entry.build]) : t('{form}?', { form: t(PET_BUILD_LABEL[entry.build]) })}
                  </Text>
                  {entry === closest && entry.progress > 0 ? (
                    <Text style={styles.closest} numberOfLines={1}>
                      {t('closest')}
                    </Text>
                  ) : null}
                  {/* Just the percent while locked: the silhouette and the "?" already say locked. */}
                  <Text style={[styles.status, entry.earned && styles.statusEarned]} numberOfLines={1}>
                    {isWorn
                      ? t('Wearing')
                      : entry.earned
                        ? switchable ? t('Tap to wear') : t('Earned')
                        : `${Math.round(entry.progress * 100)}%`}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(entry.progress * 100)}%` }, entry.earned && styles.fillEarned]} />
                </View>
                {!entry.earned ? (
                  <Text style={styles.needs} numberOfLines={2}>
                    {needs.length ? needs.join(' · ') : t('Ready — it happens on the next thing you log.')}
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
  // The house card: no outline, rounder, continuous corners.
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 18,
  },
  hint: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, marginTop: 6, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.cardSoft,
  },
  // The form being worn: a soft green fill rather than an outline.
  rowWorn: { backgroundColor: colors.mint },
  silhouette: { width: SILHOUETTE, height: SILHOUETTE },
  detail: { flex: 1, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...text.heading, fontSize: 20, color: colors.ink, flexShrink: 1 },
  closest: {
    flexShrink: 0,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '600',
    color: colors.coralDeep,
    backgroundColor: colors.selectedFill,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  status: { marginLeft: 'auto', flexShrink: 0, fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  statusEarned: { color: colors.mintDeep },
  track: { height: 8, borderRadius: 12, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 12, backgroundColor: colors.coral },
  fillEarned: { backgroundColor: colors.mintDeep },
  needs: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, lineHeight: 16 },
}));
