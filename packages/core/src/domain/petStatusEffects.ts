import {
  CRITICAL_NEED,
  HEALTH_DRAIN_PER_CRITICAL_NEED_PER_DAY,
  HEALTH_REGEN_PER_DAY,
  THRIVING_NEED,
  VITAL_NEEDS,
} from './decay';
import { AILMENT_THRESHOLDS, assessCondition, type PetAilment } from './petCondition';
import { SLEEPY_ENERGY_THRESHOLD, SLUGGISH_VITALITY_THRESHOLD } from './petHealthEngine';
import { chargeOf, type PetState } from './pet';

/**
 * The pet's active states, as a list you can read at a glance.
 *
 * The dashboard already shows an ailment as a sprite pose, a particle overlay and
 * one line of headline copy, but only ever the WORST one — a pet that is starving
 * and foggy and lonely looks exactly like a pet that is only starving. This is the
 * full list, so "what is actually wrong" is answerable without opening the stat
 * sheet and comparing numbers against thresholds in your head.
 *
 * Every entry is derived from an existing mechanic and states its real effect.
 * Nothing here invents a buff the engine does not actually apply: `decay.ts` grants
 * health while every vital sits above THRIVING_NEED and drains it per need below
 * CRITICAL_NEED, and those are the two effects reported.
 */

export type StatusEffectKind = 'buff' | 'debuff';

export interface StatusEffect {
  id: PetAilment | 'sleepy' | 'sluggish' | 'thriving';
  kind: StatusEffectKind;
  /** Chip text. Kept to one word so a stack of them stays readable. */
  label: string;
  /** What it is doing, in the engine's real terms. */
  detail: string;
}

/** The stats by the names the app shows them under, not their storage keys. */
const STAT_NAME: Partial<Record<keyof PetState, string>> = {
  health: 'Health',
  nutrition: 'Hunger',
  energy: 'Vitality',
  happiness: 'Happiness',
  mind: 'Mind',
};

const AILMENT_LABEL: Record<PetAilment, { label: string; stat: keyof PetState }> = {
  dying: { label: 'Fading', stat: 'health' },
  starving: { label: 'Starving', stat: 'nutrition' },
  exhausted: { label: 'Exhausted', stat: 'energy' },
  sad: { label: 'Lonely', stat: 'happiness' },
  foggy: { label: 'Foggy', stat: 'mind' },
};

const RECOVERY_HINT: Record<PetAilment, string> = {
  dying: 'Any care moment at all helps.',
  starving: 'Log a meal.',
  exhausted: 'Log a walk or a workout.',
  sad: 'Play, or spend time together.',
  foggy: 'Try the Mind Gym.',
};

/** Whether a need is low enough to actually cost health, as opposed to merely reading badly. */
const isDraining = (pet: PetState, ailment: PetAilment): boolean =>
  (VITAL_NEEDS as readonly string[]).includes(AILMENT_LABEL[ailment].stat as string) &&
  (pet[AILMENT_LABEL[ailment].stat] as number) <= CRITICAL_NEED;

/**
 * Active buffs and debuffs, worst debuff first, buffs last.
 *
 * `sleepy` (low Energy) and `sluggish` (low Vitality) are debuffs in their own
 * right: real moods the engine sets, which would otherwise show nothing until
 * an ailment threshold. `sluggish` is suppressed when `exhausted` is present,
 * which is the same state further along.
 */
export const getStatusEffects = (pet: PetState): StatusEffect[] => {
  const condition = assessCondition(pet);
  const effects: StatusEffect[] = [];

  for (const ailment of condition.ailments) {
    const { label, stat } = AILMENT_LABEL[ailment];
    const value = pet[stat] as number;
    const drain = isDraining(pet, ailment)
      ? ` Costing ${HEALTH_DRAIN_PER_CRITICAL_NEED_PER_DAY} health a day.`
      : '';
    effects.push({
      id: ailment,
      kind: 'debuff',
      label,
      detail: `${STAT_NAME[stat] ?? stat} ${Math.round(value)}, at or under ${AILMENT_THRESHOLDS[ailment]}.${drain} ${RECOVERY_HINT[ailment]}`,
    });
  }

  // Energy (sleep and food) is not a vital need: low, it makes the pet
  // sleepy, and that is all it does.
  if (chargeOf(pet) < SLEEPY_ENERGY_THRESHOLD) {
    effects.push({
      id: 'sleepy',
      kind: 'debuff',
      label: 'Sleepy',
      detail: `Energy ${Math.round(chargeOf(pet))}, under ${SLEEPY_ENERGY_THRESHOLD}. A good night's sleep or a meal will lift it.`,
    });
  }
  const alreadyExhausted = condition.ailments.includes('exhausted');
  if (!alreadyExhausted && pet.energy < SLUGGISH_VITALITY_THRESHOLD) {
    effects.push({
      id: 'sluggish',
      kind: 'debuff',
      label: 'Sluggish',
      detail: `Vitality ${Math.round(pet.energy)}, under ${SLUGGISH_VITALITY_THRESHOLD}. Not costing health yet — it starts at ${CRITICAL_NEED}.`,
    });
  }

  // Buffs are suppressed while anything is wrong. `mind` is not a vital need, so
  // a foggy pet with its other needs high really is regenerating health — but
  // "Thriving" sitting beside "Foggy" reads as a contradiction rather than as the
  // two separate facts it is, and the debuff is the one worth acting on.
  const thriving = effects.length === 0 && VITAL_NEEDS.every((need) => pet[need] >= THRIVING_NEED);
  if (thriving) {
    effects.push({
      id: 'thriving',
      kind: 'buff',
      label: 'Thriving',
      detail: `Every need above ${THRIVING_NEED}, so health is recovering ${HEALTH_REGEN_PER_DAY} a day.`,
    });
  }

  return effects;
};
