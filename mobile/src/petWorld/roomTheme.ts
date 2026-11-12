import { ROOM_THEMES, type RoomTheme } from '@vitto/core';
import { THEME_ART } from './themeArt';

export type { RoomTheme };

/**
 * What the shop calls each room theme (the themes themselves, and what they
 * cost, live in core's roomThemes.ts). A theme redraws all five rooms.
 */
export const ROOM_THEME_LABEL: Record<RoomTheme, string> = {
  classic: 'Classic',
  space: 'Space station',
  cloud: 'Cloud kingdom',
  elf: 'Elf treehouse',
  reef: 'Coral reef',
  mountain: 'Mountain cabin',
  candy: 'Candy land',
  desert: 'Desert oasis',
  cyber: 'Neon city',
};

export const ROOM_THEME_DETAIL: Record<RoomTheme, string> = {
  classic: 'The cozy house',
  space: 'A lounge, galley, gym, study and garden dome in orbit',
  cloud: 'A palace lounge, kitchen, gym, study and terrace above the clouds',
  elf: 'A treehouse lounge, kitchen, gym and library in an elven village',
  reef: 'An undersea dome, with the open reef outside',
  mountain: 'A snowy log cabin with a fireside lounge and the slopes outside',
  candy: 'A gingerbread house full of sweets, with candyland outside',
  desert: 'Sun-warmed rooms around a palm oasis',
  cyber: 'A neon-lit flat above a rainy cyberpunk city',
};

const ROOM_ORDER = ['living', 'kitchen', 'gym', 'study', 'outside'] as const;

/** Each theme's day art for its five rooms, for the shop's previews. */
export const ROOM_THEME_PREVIEWS = Object.fromEntries(
  ROOM_THEMES.map((theme) => [
    theme,
    theme === 'classic'
      ? [
          require('../../assets/environments/main-day.png'),
          require('../../assets/environments/kitchen-day.png'),
          require('../../assets/environments/gym-day.png'),
          require('../../assets/environments/study-day.png'),
          require('../../assets/environments/outside-day.png'),
        ]
      : ROOM_ORDER.map((room) => THEME_ART[theme][room].day.art),
  ]),
) as Record<RoomTheme, number[]>;
