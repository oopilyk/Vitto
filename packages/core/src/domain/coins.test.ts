import { describe, expect, it } from 'vitest';
import { BREED_CHANGE_COST, LEVEL_UP_COINS, breedSwitchCost, canAfford, coinsEarned, coinsOf, spendCoins, switchBreed } from './coins';
import { createPet, ownedBreedsOf } from './pet';
import { applyDelta } from './petHealthEngine';

describe('coins', () => {
  const pet = () => ({ ...createPet('u', 'Blue', 'dog', 'bear'), level: 3, xp: 90 });

  it('are earned on level-ups only', () => {
    expect(coinsEarned(0)).toBe(0);
    expect(coinsEarned(1)).toBe(LEVEL_UP_COINS);
    expect(coinsEarned(2)).toBe(2 * LEVEL_UP_COINS);
    expect(coinsEarned(-1)).toBe(0);
    // XP inside a level pays nothing.
    expect(applyDelta(pet(), { xp: 5 }, '2026-09-30T11:00:00Z').coins).toBe(0);
    const after = applyDelta(pet(), { xp: 30 }, '2026-09-30T12:00:00Z');
    expect(after.level).toBe(4);
    expect(after.coins).toBe(LEVEL_UP_COINS);
    // Nothing that is not XP pays.
    expect(applyDelta(after, { energy: 10 }, '2026-09-30T13:00:00Z').coins).toBe(after.coins);
  });

  it('are spent only when there are enough', () => {
    const rich = { ...pet(), coins: BREED_CHANGE_COST + 20 };
    expect(canAfford(rich, BREED_CHANGE_COST)).toBe(true);
    expect(coinsOf(spendCoins(rich, BREED_CHANGE_COST)!)).toBe(20);
    expect(spendCoins({ ...pet(), coins: 10 }, BREED_CHANGE_COST)).toBeNull();
    expect(coinsOf(pet())).toBe(0);
  });

  it('charge for a new animal, and add it to the ones owned', () => {
    const blue = { ...pet(), coins: BREED_CHANGE_COST + 20 };
    expect(ownedBreedsOf(blue)).toEqual(['bear']);
    expect(breedSwitchCost(blue, 'fox')).toBe(BREED_CHANGE_COST);
    const fox = switchBreed(blue, 'fox')!;
    expect(fox.breed).toBe('fox');
    expect(coinsOf(fox)).toBe(20);
    expect(fox.ownedBreeds).toEqual(['bear', 'fox']);
    // The same pet, only a new look.
    expect({ ...fox, breed: blue.breed, coins: blue.coins, ownedBreeds: undefined }).toEqual({ ...blue, ownedBreeds: undefined });
    // Not enough for another new one.
    expect(switchBreed(fox, 'shiba')).toBeNull();
  });

  it('switch back to an owned animal free, keeping every one owned', () => {
    const fox = switchBreed({ ...pet(), coins: BREED_CHANGE_COST }, 'fox')!;
    expect(coinsOf(fox)).toBe(0);
    expect(breedSwitchCost(fox, 'bear')).toBe(0);
    const bear = switchBreed(fox, 'bear')!;
    expect(bear.breed).toBe('bear');
    expect(coinsOf(bear)).toBe(0);
    expect(bear.ownedBreeds).toEqual(['bear', 'fox']);
    const back = switchBreed(bear, 'fox')!;
    expect(back.ownedBreeds).toEqual(['bear', 'fox']);
  });

  it('are not spent on a free switch (the dev account), which still keeps the animal', () => {
    const fox = switchBreed(pet(), 'fox', true)!;
    expect(coinsOf(fox)).toBe(0);
    expect(fox.ownedBreeds).toEqual(['bear', 'fox']);
  });
});
