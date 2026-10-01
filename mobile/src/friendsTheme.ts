import type { SocialHealthTone } from '@vitto/core';
import { colors, getColorScheme } from './theme';

/**
 * Friends & Social Pets -- the day/night palette for the friends surfaces.
 *
 * The product owner wants the friends list "light during the day and dark
 * during the night", the way Snapchat's is. Rather than thread a dozen
 * conditional style props through every row, the screen picks one of these two
 * flat palettes from `isNightTime()` and passes it down. Day reuses the app's
 * warm paper palette; night is a near-black ground with bright text, matching
 * the reference.
 */
export interface FriendsPalette {
  screenBg: string;
  /** Row / card surface sitting on `screenBg`. */
  rowBg: string;
  primaryText: string;
  secondaryText: string;
  divider: string;
  /**
   * The pinned "wants to be friends" banner. Neutral on purpose: it used to be
   * the coral wash, which is the same family as `ErrorText` and the Decline
   * link, so a friendly invitation read as something having gone wrong. The
   * Accept (mint) and Decline (coral) links carry the meaning instead.
   */
  bannerBg: string;
  bannerText: string;
  /** Keeps the neutral banner distinct from the rows beneath it. */
  bannerBorder: string;
  /** Circle behind a pet-less friend's initial. */
  avatarPlaceholderBg: string;
}

/** Day: the app's own palette, read live (getters) so it is the light one whenever this is used. */
export const FRIENDS_LIGHT: FriendsPalette = {
  get screenBg() { return colors.paper; },
  get rowBg() { return colors.card; },
  get primaryText() { return colors.ink; },
  get secondaryText() { return colors.muted; },
  get divider() { return colors.hairline; },
  get bannerBg() { return colors.card; },
  get bannerText() { return colors.ink; },
  get bannerBorder() { return colors.border; },
  get avatarPlaceholderBg() { return colors.sageSoft; },
};

export const FRIENDS_DARK: FriendsPalette = {
  screenBg: '#111014',
  rowBg: '#1c1b21',
  primaryText: '#f7f5ff',
  secondaryText: '#9a97a6',
  divider: '#2c2b33',
  bannerBg: '#1c1b21',
  bannerText: '#f7f5ff',
  bannerBorder: '#3a3944',
  avatarPlaceholderBg: '#2c2b33',
};

/** Night, or the app in dark mode, gets the dark list; otherwise the day one. */
export const friendsPalette = (isNight: boolean): FriendsPalette =>
  isNight || getColorScheme() === 'dark' ? FRIENDS_DARK : FRIENDS_LIGHT;

/**
 * The colour a `SocialHealthInfo.tone` reads as in a status line. `neutral`
 * defers to the palette's secondary text so a plain "Healthy" does not shout;
 * the other three are the app's existing semantic colours.
 */
export const healthToneColor = (tone: SocialHealthTone, palette: FriendsPalette): string => {
  switch (tone) {
    case 'good':
      return colors.mintDeep;
    case 'warn':
      return colors.yellowDeep;
    case 'bad':
      return colors.danger;
    case 'neutral':
    default:
      return palette.secondaryText;
  }
};
