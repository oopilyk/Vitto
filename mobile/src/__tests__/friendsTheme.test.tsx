import { FRIENDS_DARK, FRIENDS_LIGHT, friendsPalette } from '../friendsTheme';
import { colors } from '../theme';

/**
 * The requests banner used to be the coral wash — the same family as
 * `ErrorText` and the Decline link — so a friendly invitation read as an error.
 * These pin it neutral so it cannot drift back.
 */
describe('friends requests banner', () => {
  it('is neutral, not the app\'s error/attention coral', () => {
    for (const palette of [FRIENDS_LIGHT, FRIENDS_DARK]) {
      expect(palette.bannerBg).not.toBe(colors.coralWash);
      expect(palette.bannerText).not.toBe(colors.coralDeep);
      expect(palette.bannerBg).not.toBe(colors.coral);
    }
  });

  it('reads as a card on the screen, with a border to separate it', () => {
    expect(FRIENDS_LIGHT.bannerBg).toBe(colors.card);
    expect(FRIENDS_LIGHT.bannerText).toBe(colors.ink);
    expect(FRIENDS_LIGHT.bannerBorder).toBeTruthy();
    expect(FRIENDS_DARK.bannerBorder).toBeTruthy();
    // Distinguishable from the plain rows beneath it.
    expect(FRIENDS_DARK.bannerBorder).not.toBe(FRIENDS_DARK.rowBg);
  });

  it('picks the night palette after dark', () => {
    expect(friendsPalette(true)).toBe(FRIENDS_DARK);
    expect(friendsPalette(false)).toBe(FRIENDS_LIGHT);
  });
});
