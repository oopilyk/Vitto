import { FRIENDS_DARK, FRIENDS_LIGHT, friendsPalette } from '../friendsTheme';
import { colors, setActiveColorScheme } from '../theme';

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

  it("follows the app's appearance, not the clock", () => {
    // Light chosen in Settings: light at any hour (it used to go dark at night).
    setActiveColorScheme('light');
    expect(friendsPalette()).toBe(FRIENDS_LIGHT);
    setActiveColorScheme('dark');
    expect(friendsPalette()).toBe(FRIENDS_DARK);
    setActiveColorScheme('light');
  });

  it("takes the room's light for text laid over a friend's room", () => {
    expect(friendsPalette(true)).toBe(FRIENDS_DARK);
    expect(friendsPalette(false)).toBe(FRIENDS_LIGHT);
  });
});
