import { ownedBreedsOf, ownsBreed, type PetBreed, type PetState } from './pet';

/**
 * Coins: the pet's pocket money, earned by caring for it and spent on changes.
 *
 * Earned on level-ups only: 50 a level. They track real care exactly as XP
 * does (a level is 100 XP of it) and cannot be farmed any faster.
 * Kept on the pet (partners share them, like XP) and saved with it. Only as
 * tamper-proof as XP itself, which the app computes and saves: fine for
 * cosmetic spending, not for anything bought with real money.
 */
export const LEVEL_UP_COINS = 50;

/**
 * What a new animal for the pet costs. Adopting (the first pick) is free, and
 * so is going back to one it already owns.
 */
export const BREED_CHANGE_COST = 500;

export const coinsOf = (pet: Pick<PetState, 'coins'>): number => Math.max(0, Math.floor(pet.coins ?? 0));

/** Coins for an event that crossed `levelsGained` level lines. XP within a level pays nothing. */
export const coinsEarned = (levelsGained: number): number => Math.max(0, levelsGained) * LEVEL_UP_COINS;

export const canAfford = (pet: Pick<PetState, 'coins'>, cost: number): boolean => coinsOf(pet) >= cost;

/** The pet with `cost` coins spent, or null when it cannot afford it. */
export const spendCoins = <T extends PetState>(pet: T, cost: number): T | null =>
  canAfford(pet, cost) ? { ...pet, coins: coinsOf(pet) - cost } : null;

/** What switching to `breed` costs this pet: nothing for one it owns, or with `free` (the dev account). */
export const breedSwitchCost = (
  pet: Partial<Pick<PetState, 'breed' | 'ownedBreeds'>>,
  breed: PetBreed,
  free = false,
): number => (free || ownsBreed(pet, breed) ? 0 : BREED_CHANGE_COST);

/**
 * The pet as `breed`, paid for and added to the animals it owns, or null when
 * it cannot afford it. The same pet either way: only its look changes. Mirrors
 * `switch_pet_breed`, which is what really charges.
 */
export const switchBreed = <T extends PetState>(pet: T, breed: PetBreed, free = false): T | null => {
  const paid = spendCoins(pet, breedSwitchCost(pet, breed, free));
  if (!paid) return null;
  const owned = ownedBreedsOf(pet);
  return { ...paid, breed, ownedBreeds: owned.includes(breed) ? owned : [...owned, breed] };
};
