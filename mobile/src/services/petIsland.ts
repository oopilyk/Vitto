import { Platform } from 'react-native';
import {
  DECAY_PERIOD_MS,
  DECAY_PER_DAY,
  MOOD_WORD,
  nextHungryAt,
  SLEEPY_ENERGY_THRESHOLD,
  assessCondition,
  untrackedNeeds,
  type CareArea,
  type PetState,
} from '@vitto/core';
import { sheetForPet } from '../components/petSprites';
import { endIsland, isIslandAvailable, syncIsland, type IslandState } from '../../modules/pet-island';

/**
 * The pet in the Dynamic Island.
 *
 * The Island is drawn by a widget the app cannot talk to once it is closed, so
 * instead of numbers it is handed DATES: when each need bar was full and when
 * it will be empty at the pet's decay rate, and when the pet next gets hungry
 * or sleepy. SwiftUI can drain a bar between two dates and count down to one on
 * its own, which keeps the Island honest for hours after the app last ran. The
 * next open refreshes everything.
 *
 * All of it comes from the same decay the app itself uses (`applyTimeDecay`):
 * needs fall linearly, so "empty at" is one division; hunger is the last
 * day's meals, so "hungry at" is when enough of them have worn off.
 */

const MS_PER_DAY = DECAY_PERIOD_MS;

/** The asset name of a sheet's still frame: "Tabby Cat · Lifter" -> "tabbyCatLifter". */
export const spriteAssetName = (label: string): string =>
  label
    .split('·')
    .flatMap((part) => part.trim().split(/\s+/))
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');

type Need = 'energy' | 'happiness';

/**
 * When a need was last at 100 and when it reaches 0, if it only ever fell at
 * its rate. The widget draws the bar sliding between the two, so at `now` it
 * sits exactly at the current value.
 */
const window = (value: number, need: Need, now: number, held = false): { fullAt: number; emptyAt: number } => {
  // A need the person doesn't track never falls: drawn as a bar that would take
  // a century to move, which the widget shows as standing still.
  const perMs = held ? 1 / (100 * 365 * MS_PER_DAY) : DECAY_PER_DAY[need] / MS_PER_DAY;
  const clamped = Math.max(0, Math.min(100, value));
  return {
    fullAt: now - (100 - clamped) / perMs,
    emptyAt: now + clamped / perMs,
  };
};

/** The moment `value` falls below `threshold` at its rate, or null if it already has. */
const crossingAt = (value: number, threshold: number, need: Need, now: number, held = false): number | null => {
  if (held || value < threshold) return null;
  const perMs = DECAY_PER_DAY[need] / MS_PER_DAY;
  return now + (value - threshold) / perMs;
};

const seconds = (ms: number) => Math.round(ms / 1000);

export const buildIslandState = (pet: PetState, now: number = Date.now(), careAreas?: readonly CareArea[] | null): IslandState => {
  // Needs the person doesn't track (see careAreas in @vitto/core) never run down.
  const held = new Set<string>(untrackedNeeds(careAreas));
  // Hunger steps down as meals wear off rather than draining, so its bar
  // stands still and the moment that matters is "hungry at" below.
  const nutrition = window(pet.nutrition, 'energy', now, true);
  const energy = window(pet.energy, 'energy', now, held.has('energy'));
  const happiness = window(pet.happiness, 'happiness', now);

  // Whichever comes first: hungry or sleepy. Neither once it already is one.
  const candidates: { need: string; at: number }[] = [];
  const hungryAt = held.has('nutrition') ? null : nextHungryAt(pet, now);
  const sleepyAt = crossingAt(pet.energy, SLEEPY_ENERGY_THRESHOLD, 'energy', now, held.has('energy'));
  if (hungryAt !== null) candidates.push({ need: 'hungry', at: hungryAt });
  if (sleepyAt !== null) candidates.push({ need: 'sleepy', at: sleepyAt });
  const next = pet.mood === 'hungry' || pet.mood === 'sleepy'
    ? null
    : candidates.sort((a, b) => a.at - b.at)[0] ?? null;

  // A dying pet is the one thing worse than any mood, and the Island should
  // say so rather than "doing fine".
  const fading = assessCondition(pet).primary === 'dying';
  const headline = fading ? `${pet.name} is fading` : `${pet.name} is ${MOOD_WORD[pet.mood]}`;

  return {
    petId: pet.id,
    name: pet.name,
    sprite: spriteAssetName(sheetForPet(pet).label),
    headline,
    mood: pet.mood,
    health: Math.max(0, Math.min(1, pet.health / 100)),
    asOf: seconds(now),
    nutritionFullAt: seconds(nutrition.fullAt),
    nutritionEmptyAt: seconds(nutrition.emptyAt),
    energyFullAt: seconds(energy.fullAt),
    energyEmptyAt: seconds(energy.emptyAt),
    happinessFullAt: seconds(happiness.fullAt),
    happinessEmptyAt: seconds(happiness.emptyAt),
    ...(next ? { nextNeedAt: seconds(next.at), nextNeed: next.need } : {}),
  };
};

/**
 * What the Island needs to be told again. The stats slide on their own, so a
 * decay tick is not a reason to update; a log (which moves the anchors), a
 * mood change, a new form or a rename is.
 */
export const islandSignature = (pet: PetState): string =>
  [pet.id, pet.name, pet.mood, assessCondition(pet).primary ?? '', sheetForPet(pet).label, pet.lastEventAt ?? '', Math.round(pet.health / 5)].join('|');

export const canShowIsland = (): boolean => Platform.OS === 'ios' && isIslandAvailable();

/** Puts the pet on the Island, or takes it off when the setting is off. */
export const syncPetIsland = async (
  pet: PetState,
  enabled: boolean,
  now: number = Date.now(),
  careAreas?: readonly CareArea[] | null,
): Promise<void> => {
  if (!canShowIsland()) return;
  if (!enabled) {
    await endIsland();
    return;
  }
  await syncIsland(buildIslandState(pet, now, careAreas));
};

export const clearPetIsland = async (): Promise<void> => {
  if (Platform.OS !== 'ios') return;
  await endIsland();
};
