import type { SocialHealthTone } from '@vitto/core';
import { colors, getColorScheme } from './theme';

/**
 * Friends & Social Pets -- the light and dark palettes for the friends surfaces.
 *
 * The friends pages follow the app's appearance (Settings > Appearance), as
 * every other page does. They used to go dark on the clock instead ("light
 * during the day and dark during the night", the way Snapchat's list is),
 * which predates the Appearance setting: with Light chosen, the list still
 * turned dark at 7pm. Rather than thread a dozen conditional style props
 * through every row, a screen picks one of these two flat palettes with
 * `friendsPalette()` and passes it down. Light reuses the app's own palette;
 * dark is a near-black ground with bright text.
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

/**
 * The palette for a friends page: the app's appearance, unless `dark` says
 * otherwise. The one caller that does is text laid over a friend's room, whose
 * art follows the clock whatever the appearance: at night it needs the dark
 * palette's tones.
 */
export const friendsPalette = (dark: boolean = getColorScheme() === 'dark'): FriendsPalette =>
  dark ? FRIENDS_DARK : FRIENDS_LIGHT;

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
