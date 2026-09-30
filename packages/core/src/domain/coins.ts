import type { PetState } from './pet';

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

/** What changing the pet's animal costs. Adopting (the first pick) is free. */
export const BREED_CHANGE_COST = 500;

export const coinsOf = (pet: Pick<PetState, 'coins'>): number => Math.max(0, Math.floor(pet.coins ?? 0));

/** Coins for an event that crossed `levelsGained` level lines. XP within a level pays nothing. */
export const coinsEarned = (levelsGained: number): number => Math.max(0, levelsGained) * LEVEL_UP_COINS;

export const canAfford = (pet: Pick<PetState, 'coins'>, cost: number): boolean => coinsOf(pet) >= cost;

/** The pet with `cost` coins spent, or null when it cannot afford it. */
export const spendCoins = <T extends PetState>(pet: T, cost: number): T | null =>
  canAfford(pet, cost) ? { ...pet, coins: coinsOf(pet) - cost } : null;
