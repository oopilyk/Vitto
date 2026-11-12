import type { RoomTheme } from '@vitto/core';

/**
 * The art for every room theme but classic, whose rooms keep their own
 * hand-tuned numbers in each *Environment file.
 *
 * Every theme here is drawn 971 wide and was made the same way, so the rooms
 * share one set of rules -- see `themedRoom`. The kitchens, gyms, studies and
 * outdoors are 3:5; the living rooms are 2:3, redrawn with their trophy shelf
 * an eighth of the width in from the edge so the zoom never crops it (see
 * `THEME_SHELVES`). `tint` is the art's own top-edge colour, painted in the
 * band above it; `floor` its bottom-edge colour, for the strip a lift uncovers
 * (see `EnvironmentBackdrop`). Both are the average of the art's outer four
 * pixel rows. Space's other rooms keep the values they were tuned with.
 */

export type ThemedRoom = 'living' | 'kitchen' | 'gym' | 'study' | 'outside';
export type ArtTheme = Exclude<RoomTheme, 'classic'>;

interface Lit {
  art: number;
  tint: string;
  floor: string;
}

export const THEME_ART: Record<ArtTheme, Record<ThemedRoom, { day: Lit; night: Lit }>> = {
  space: {
    living: {
      day: { art: require('../../assets/environments/themes/space/living-day.png'), tint: '#decbc9', floor: '#cbb5b7' },
      night: { art: require('../../assets/environments/themes/space/living-night.png'), tint: '#121625', floor: '#161929' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/space/kitchen-day.png'), tint: '#ab8e95', floor: '#bd9895' },
      night: { art: require('../../assets/environments/themes/space/kitchen-night.png'), tint: '#342f5f', floor: '#4d3758' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/space/gym-day.png'), tint: '#b79ba2', floor: '#bf9e9c' },
      night: { art: require('../../assets/environments/themes/space/gym-night.png'), tint: '#322951', floor: '#48314e' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/space/study-day.png'), tint: '#b399a0', floor: '#b399a0' },
      night: { art: require('../../assets/environments/themes/space/study-night.png'), tint: '#37325a', floor: '#37325a' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/space/outside-day.png'), tint: '#4b6273', floor: '#4b6273' },
      night: { art: require('../../assets/environments/themes/space/outside-night.png'), tint: '#191e33', floor: '#191e33' },
    },
  },
  cloud: {
    living: {
      day: { art: require('../../assets/environments/themes/cloud/living-day.png'), tint: '#dcc0c1', floor: '#e3cace' },
      night: { art: require('../../assets/environments/themes/cloud/living-night.png'), tint: '#3a385a', floor: '#4b4970' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/cloud/kitchen-day.png'), tint: '#e7cdc0', floor: '#e2bfaa' },
      night: { art: require('../../assets/environments/themes/cloud/kitchen-night.png'), tint: '#40355a', floor: '#603e50' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/cloud/gym-day.png'), tint: '#ead3ca', floor: '#e3c4b1' },
      night: { art: require('../../assets/environments/themes/cloud/gym-night.png'), tint: '#2a264c', floor: '#3c2e4d' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/cloud/study-day.png'), tint: '#cbafa7', floor: '#e4c6c8' },
      night: { art: require('../../assets/environments/themes/cloud/study-night.png'), tint: '#3c3861', floor: '#352d4f' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/cloud/outside-day.png'), tint: '#8aa483', floor: '#f6d6bf' },
      night: { art: require('../../assets/environments/themes/cloud/outside-night.png'), tint: '#252f49', floor: '#504768' },
    },
  },
  elf: {
    living: {
      day: { art: require('../../assets/environments/themes/elf/living-day.png'), tint: '#9c714b', floor: '#b37b5d' },
      night: { art: require('../../assets/environments/themes/elf/living-night.png'), tint: '#2d1c14', floor: '#381f19' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/elf/kitchen-day.png'), tint: '#6e463c', floor: '#a16a5a' },
      night: { art: require('../../assets/environments/themes/elf/kitchen-night.png'), tint: '#312120', floor: '#552f2b' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/elf/gym-day.png'), tint: '#6b4336', floor: '#ae6e55' },
      night: { art: require('../../assets/environments/themes/elf/gym-night.png'), tint: '#321f1b', floor: '#532f2b' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/elf/study-day.png'), tint: '#754836', floor: '#af6b51' },
      night: { art: require('../../assets/environments/themes/elf/study-night.png'), tint: '#301c1a', floor: '#532c26' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/elf/outside-day.png'), tint: '#8fa25f', floor: '#8a9743' },
      night: { art: require('../../assets/environments/themes/elf/outside-night.png'), tint: '#314026', floor: '#2f422b' },
    },
  },
  reef: {
    living: {
      day: { art: require('../../assets/environments/themes/reef/living-day.png'), tint: '#5ecbe3', floor: '#f6cdae' },
      night: { art: require('../../assets/environments/themes/reef/living-night.png'), tint: '#214574', floor: '#1d3452' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/reef/kitchen-day.png'), tint: '#67b0c2', floor: '#c1a498' },
      night: { art: require('../../assets/environments/themes/reef/kitchen-night.png'), tint: '#214071', floor: '#78697c' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/reef/gym-day.png'), tint: '#61b1c4', floor: '#c2a497' },
      night: { art: require('../../assets/environments/themes/reef/gym-night.png'), tint: '#1f4375', floor: '#70667d' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/reef/study-day.png'), tint: '#64b3c5', floor: '#c9ada1' },
      night: { art: require('../../assets/environments/themes/reef/study-night.png'), tint: '#152955', floor: '#6a576c' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/reef/outside-day.png'), tint: '#43ddf6', floor: '#d8b9a8' },
      night: { art: require('../../assets/environments/themes/reef/outside-night.png'), tint: '#0e2e5c', floor: '#28447e' },
    },
  },
  mountain: {
    living: {
      day: { art: require('../../assets/environments/themes/mountain/living-day.png'), tint: '#a55c41', floor: '#99563e' },
      night: { art: require('../../assets/environments/themes/mountain/living-night.png'), tint: '#18101d', floor: '#130d16' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/mountain/kitchen-day.png'), tint: '#90442d', floor: '#a65b44' },
      night: { art: require('../../assets/environments/themes/mountain/kitchen-night.png'), tint: '#562823', floor: '#612e2a' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/mountain/gym-day.png'), tint: '#8d432e', floor: '#9f533e' },
      night: { art: require('../../assets/environments/themes/mountain/gym-night.png'), tint: '#562824', floor: '#60302d' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/mountain/study-day.png'), tint: '#8a422e', floor: '#ac5a40' },
      night: { art: require('../../assets/environments/themes/mountain/study-night.png'), tint: '#562924', floor: '#65322e' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/mountain/outside-day.png'), tint: '#5091f6', floor: '#abb7f0' },
      night: { art: require('../../assets/environments/themes/mountain/outside-night.png'), tint: '#061645', floor: '#4863b2' },
    },
  },
  candy: {
    living: {
      day: { art: require('../../assets/environments/themes/candy/living-day.png'), tint: '#ca663d', floor: '#df895e' },
      night: { art: require('../../assets/environments/themes/candy/living-night.png'), tint: '#2d1618', floor: '#351816' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/candy/kitchen-day.png'), tint: '#d37051', floor: '#f5905b' },
      night: { art: require('../../assets/environments/themes/candy/kitchen-night.png'), tint: '#943b39', floor: '#a3423a' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/candy/gym-day.png'), tint: '#d36f4f', floor: '#f8935e' },
      night: { art: require('../../assets/environments/themes/candy/gym-night.png'), tint: '#8d3936', floor: '#a2453a' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/candy/study-day.png'), tint: '#d36f51', floor: '#f68e59' },
      night: { art: require('../../assets/environments/themes/candy/study-night.png'), tint: '#762d31', floor: '#752e32' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/candy/outside-day.png'), tint: '#6ab9fe', floor: '#fcb2ad' },
      night: { art: require('../../assets/environments/themes/candy/outside-night.png'), tint: '#000c41', floor: '#da6372' },
    },
  },
  desert: {
    living: {
      day: { art: require('../../assets/environments/themes/desert/living-day.png'), tint: '#eb9e6e', floor: '#e89865' },
      night: { art: require('../../assets/environments/themes/desert/living-night.png'), tint: '#271d31', floor: '#342230' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/desert/kitchen-day.png'), tint: '#a44827', floor: '#e37d4d' },
      night: { art: require('../../assets/environments/themes/desert/kitchen-night.png'), tint: '#622617', floor: '#a24933' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/desert/gym-day.png'), tint: '#9f4527', floor: '#e37b4d' },
      night: { art: require('../../assets/environments/themes/desert/gym-night.png'), tint: '#5b2316', floor: '#944432' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/desert/study-day.png'), tint: '#9e4729', floor: '#e57e4e' },
      night: { art: require('../../assets/environments/themes/desert/study-night.png'), tint: '#562117', floor: '#883b2e' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/desert/outside-day.png'), tint: '#b68bcf', floor: '#ef8445' },
      night: { art: require('../../assets/environments/themes/desert/outside-night.png'), tint: '#0c1037', floor: '#a25340' },
    },
  },
  // One living room for day and night: the neon flat is lit the same either way.
  cyber: {
    living: {
      day: { art: require('../../assets/environments/themes/cyber/living.png'), tint: '#5d2c5d', floor: '#462342' },
      night: { art: require('../../assets/environments/themes/cyber/living.png'), tint: '#5d2c5d', floor: '#462342' },
    },
    kitchen: {
      day: { art: require('../../assets/environments/themes/cyber/kitchen-day.png'), tint: '#513f61', floor: '#554165' },
      night: { art: require('../../assets/environments/themes/cyber/kitchen-night.png'), tint: '#251932', floor: '#332244' },
    },
    gym: {
      day: { art: require('../../assets/environments/themes/cyber/gym-day.png'), tint: '#503d5f', floor: '#554164' },
      night: { art: require('../../assets/environments/themes/cyber/gym-night.png'), tint: '#231346', floor: '#23154a' },
    },
    study: {
      day: { art: require('../../assets/environments/themes/cyber/study-day.png'), tint: '#514267', floor: '#534268' },
      night: { art: require('../../assets/environments/themes/cyber/study-night.png'), tint: '#2f2443', floor: '#3d2a4e' },
    },
    outside: {
      day: { art: require('../../assets/environments/themes/cyber/outside-day.png'), tint: '#7187b8', floor: '#504469' },
      night: { art: require('../../assets/environments/themes/cyber/outside-night.png'), tint: '#011031', floor: '#17123a' },
    },
  },
};

/**
 * How far the living room, kitchen and gym art is raised, so the themed rooms
 * sit a little higher on the screen; the strip it uncovers is the art's own
 * floor. The study is drawn with its floor already where the pet stands, and
 * outdoors fills the screen, so neither is lifted.
 */
export const THEMED_LIFT = 0.04;

/**
 * The redrawn living rooms (2:3, shorter than the other rooms' 3:5) sat low,
 * under a wide band of wall, so they are raised further. The pet stays put, a
 * little nearer the front of the rug; the strip uncovered at the bottom is
 * the art's own floor colour and mostly sits behind the room bar.
 */
export const LIVING_LIFT = 0.09;

/**
 * Per-room framing for art drawn at a different distance from the rest.
 *
 * The elf, reef, mountain, desert and cyber kitchens, gyms, studies and
 * outdoors are drawn closer up than the rest, so at the usual zoom (and,
 * outdoors, filling the screen) the furniture loomed over the pet and the room
 * sat high under the HUD. They are drawn at the stage's width instead,
 * unlifted, which shrinks the room around the pet and settles it lower.
 */
export interface RoomFraming {
  maxScale?: number;
  lift?: number;
  /** Outdoors only: false stops it filling the screen. */
  fill?: boolean;
}

const CLOSE_UP: RoomFraming = { maxScale: 1, lift: 0, fill: false };
const CLOSE_UP_ROOMS = { kitchen: CLOSE_UP, gym: CLOSE_UP, study: CLOSE_UP, outside: CLOSE_UP };

export const ROOM_FRAMING: Partial<Record<ArtTheme, Partial<Record<ThemedRoom, RoomFraming>>>> = {
  elf: CLOSE_UP_ROOMS,
  reef: CLOSE_UP_ROOMS,
  mountain: CLOSE_UP_ROOMS,
  desert: CLOSE_UP_ROOMS,
  cyber: CLOSE_UP_ROOMS,
};

export const framingOf = (theme: ArtTheme, room: ThemedRoom): RoomFraming => ROOM_FRAMING[theme]?.[room] ?? {};

export const themedRoom = (theme: ArtTheme, room: ThemedRoom, night: boolean): Lit =>
  THEME_ART[theme][room][night ? 'night' : 'day'];
