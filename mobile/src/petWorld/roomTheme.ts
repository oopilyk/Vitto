import { ROOM_THEMES, type RoomTheme } from '@vitto/core';
import { t } from '../i18n';
import { THEME_ART } from './themeArt';

export type { RoomTheme };

/**
 * What the shop calls each room theme (the themes themselves, and what they
 * cost, live in core's roomThemes.ts). A theme redraws all five rooms.
 */
export const ROOM_THEME_LABEL: Record<RoomTheme, string> = {
  classic: t('Classic'),
  space: t('Space station'),
  cloud: t('Cloud kingdom'),
  elf: t('Elf treehouse'),
  reef: t('Coral reef'),
  mountain: t('Mountain cabin'),
  candy: t('Candy land'),
  desert: t('Desert oasis'),
  cyber: t('Neon city'),
};

export const ROOM_THEME_DETAIL: Record<RoomTheme, string> = {
  classic: t('The cozy house'),
  space: t('A lounge, galley, gym, study and garden dome in orbit'),
  cloud: t('A palace lounge, kitchen, gym, study and terrace above the clouds'),
  elf: t('A treehouse lounge, kitchen, gym and library in an elven village'),
  reef: t('An undersea dome, with the open reef outside'),
  mountain: t('A snowy log cabin with a fireside lounge and the slopes outside'),
  candy: t('A gingerbread house full of sweets, with candyland outside'),
  desert: t('Sun-warmed rooms around a palm oasis'),
  cyber: t('A neon-lit flat above a rainy cyberpunk city'),
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

/** The same five rooms at night, for the shop's day/night switch. */
export const ROOM_THEME_NIGHT_PREVIEWS = Object.fromEntries(
  ROOM_THEMES.map((theme) => [
    theme,
    theme === 'classic'
      ? [
          require('../../assets/environments/main-night.png'),
          require('../../assets/environments/kitchen-night.png'),
          require('../../assets/environments/gym-night.png'),
          require('../../assets/environments/study-night.png'),
          require('../../assets/environments/outside-night.png'),
        ]
      : ROOM_ORDER.map((room) => THEME_ART[theme][room].night.art),
  ]),
) as Record<RoomTheme, number[]>;
