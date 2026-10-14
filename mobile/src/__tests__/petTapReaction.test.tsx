import { feelingEmoji } from '../petWorld/PetTapReaction';

describe('feelingEmoji', () => {
  it('smiles when happy and matches the mood otherwise', () => {
    expect(feelingEmoji('bright', null)).toBe('😄');
    expect(feelingEmoji('content', null)).toBe('😊');
    expect(feelingEmoji('sleepy', null)).toBe('😪');
    expect(feelingEmoji('hungry', null)).toBe('🤤');
  });

  it('lets what is wrong outrank the mood', () => {
    expect(feelingEmoji('bright', 'sad')).toBe('😢');
    expect(feelingEmoji('content', 'dying')).toBe('🤒');
  });
});
