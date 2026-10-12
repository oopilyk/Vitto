import { pickTapReaction } from '../petWorld/PetTapReaction';

describe('pickTapReaction', () => {
  it('greets a happy pet and varies the emote tap to tap', () => {
    // Arrange
    const first = pickTapReaction(0, 1, 'bright', false);
    const second = pickTapReaction(1, 1, 'bright', false);

    // Assert
    expect(first.emote).toBeTruthy();
    expect(second.emote).toBeTruthy();
    expect(second.emote).not.toBe(first.emote);
  });

  it('escalates a run of rapid taps to "okay okay!" then a dizzy spell', () => {
    expect(pickTapReaction(5, 4, 'bright', false).caption).toBe('okay okay!');
    expect(pickTapReaction(9, 7, 'content', false)).toEqual({
      emote: '@_@',
      caption: 'whoa, dizzy!',
    });
  });

  it('reacts to an unwell pet with a "needs care" register, not a cheer', () => {
    const reaction = pickTapReaction(2, 1, 'bright', true);
    expect(['not feeling great', 'needs some care', undefined]).toContain(reaction.caption);
    expect(reaction.emote).not.toBe('♥');
  });

  it('matches the mood: sleepy yawns, hungry asks for food', () => {
    expect(pickTapReaction(0, 1, 'sleepy', false).caption).toBe('so sleepy…');
    expect(pickTapReaction(0, 1, 'hungry', false).caption).toBe('kinda hungry…');
  });

  it('never uses an emoji: the streak flame is the app\'s only one', () => {
    for (let burst = 0; burst < 12; burst += 1) {
      for (const rapid of [0, 4, 7]) {
        for (const [mood, unwell] of [['bright', false], ['sleepy', false], ['hungry', false], ['content', true]] as const) {
          expect(pickTapReaction(burst, rapid, mood, unwell).emote).not.toMatch(/\p{Emoji_Presentation}/u);
        }
      }
    }
  });
});
