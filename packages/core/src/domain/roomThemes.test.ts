import { describe, expect, it } from 'vitest';
import { createPet } from './pet';
import {
  ROOM_THEME_COST,
  ownedRoomThemesOf,
  roomThemeOf,
  roomThemeSwitchCost,
  switchRoomTheme,
} from './roomThemes';

describe('room themes', () => {
  const pet = { ...createPet('user-1', 'Miso'), coins: ROOM_THEME_COST + 20 };

  it('starts every pet in the classic rooms, which it always owns', () => {
    expect(roomThemeOf(pet)).toBe('classic');
    expect(ownedRoomThemesOf(pet)).toEqual(['classic']);
    expect(roomThemeSwitchCost(pet, 'classic')).toBe(0);
  });

  it('charges for a new theme once, then switching back and forth is free', () => {
    const bought = switchRoomTheme(pet, 'space')!;
    expect(bought.roomTheme).toBe('space');
    expect(bought.coins).toBe(20);
    expect(ownedRoomThemesOf(bought)).toEqual(['classic', 'space']);

    const back = switchRoomTheme(bought, 'classic')!;
    expect(back.coins).toBe(20);
    expect(roomThemeSwitchCost(back, 'space')).toBe(0);
    expect(switchRoomTheme(back, 'space')!.coins).toBe(20);
  });

  it('refuses a theme the pet cannot afford, unless it is free (the dev account)', () => {
    const poor = { ...pet, coins: ROOM_THEME_COST - 1 };
    expect(switchRoomTheme(poor, 'space')).toBeNull();
    expect(switchRoomTheme(poor, 'space', true)?.coins).toBe(ROOM_THEME_COST - 1);
  });
});
