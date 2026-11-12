import { spendCoins } from './coins';
import type { PetState } from './pet';

/**
 * Which set of art the pet's rooms are drawn from. `classic` is the original
 * house and every pet has it; the others are bought with the pet's coins
 * (`ROOM_THEME_COST`) and then free to switch between, the same way animals
 * are. Kept on the pet, so a care partner sees the same rooms.
 */
export type RoomTheme = 'classic' | 'space' | 'cloud' | 'elf' | 'reef' | 'mountain' | 'candy' | 'desert' | 'cyber';

/** In shop order. `switch_pet_room_theme` keeps its own copy of this list. */
export const ROOM_THEMES: readonly RoomTheme[] = ['classic', 'space', 'cloud', 'elf', 'reef', 'mountain', 'candy', 'desert', 'cyber'];

/** What a room theme the pet does not own yet costs. */
export const ROOM_THEME_COST = 500;

export const isRoomTheme = (value: unknown): value is RoomTheme =>
  (ROOM_THEMES as readonly unknown[]).includes(value);

/** The theme the pet's rooms are drawn in; classic until one is picked. */
export const roomThemeOf = (pet: Partial<Pick<PetState, 'roomTheme'>>): RoomTheme => pet.roomTheme ?? 'classic';

/** Every theme the pet can switch to for free: classic, whatever it bought, and what it has on now. */
export const ownedRoomThemesOf = (pet: Partial<Pick<PetState, 'roomTheme' | 'ownedRoomThemes'>>): RoomTheme[] =>
  ROOM_THEMES.filter(
    (theme) => theme === 'classic' || theme === pet.roomTheme || (pet.ownedRoomThemes ?? []).includes(theme),
  );

export const ownsRoomTheme = (pet: Partial<Pick<PetState, 'roomTheme' | 'ownedRoomThemes'>>, theme: RoomTheme): boolean =>
  ownedRoomThemesOf(pet).includes(theme);

/** What switching to `theme` costs this pet: nothing for one it owns, or with `free` (the dev account). */
export const roomThemeSwitchCost = (
  pet: Partial<Pick<PetState, 'roomTheme' | 'ownedRoomThemes'>>,
  theme: RoomTheme,
  free = false,
): number => (free || ownsRoomTheme(pet, theme) ? 0 : ROOM_THEME_COST);

/**
 * The pet with its rooms in `theme`, paid for and added to the themes it owns,
 * or null when it cannot afford it. Mirrors `switch_pet_room_theme`, which is
 * what really charges.
 */
export const switchRoomTheme = <T extends PetState>(pet: T, theme: RoomTheme, free = false): T | null => {
  const paid = spendCoins(pet, roomThemeSwitchCost(pet, theme, free));
  if (!paid) return null;
  const bought = (pet.ownedRoomThemes ?? []).filter((owned) => owned !== 'classic');
  return {
    ...paid,
    roomTheme: theme,
    ownedRoomThemes: theme === 'classic' || bought.includes(theme) ? bought : [...bought, theme],
  };
};
