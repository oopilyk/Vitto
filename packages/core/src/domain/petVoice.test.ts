import { describe, expect, it } from 'vitest';
import { petVoice } from './petVoice';

const LINE = 'I loved the variety in that meal.';

describe('petVoice', () => {
  it('leaves a line alone with no personality and nothing wrong', () => {
    expect(petVoice(LINE)).toBe(LINE);
    expect(petVoice('  ' + LINE + ' ')).toBe(LINE);
    expect(petVoice('')).toBe('');
  });

  it('gives each personality a recognisable voice on the same line', () => {
    expect(petVoice(LINE, { personality: 'energetic' })).toMatch(/^(Ooh|Yes|Let's go)! I loved the variety in that meal!$/);
    expect(petVoice(LINE, { personality: 'chill' })).toMatch(/meal\. (No rush|All good|Easy does it)\.$/);
    expect(petVoice(LINE, { personality: 'competitive' })).toMatch(/meal\. (Beat that tomorrow\.|New record next\?|Top that\.)$/);
    expect(petVoice(LINE, { personality: 'supportive' })).toMatch(/meal\. (Proud of you\.|We've got this\.|Nice work\.)$/);
  });

  it('is deterministic — the same line always gets the same flourish', () => {
    const a = petVoice(LINE, { personality: 'competitive' });
    for (let i = 0; i < 20; i += 1) expect(petVoice(LINE, { personality: 'competitive' })).toBe(a);
  });

  it('spreads flourishes across different lines rather than repeating one', () => {
    const lines = ['I slept soundly for 8h and woke up bright.', 'I explored somewhere new today.', 'I pushed through 12 sets with you and feel stronger.', 'I liked puzzling over that together.', 'I noticed you taking care of yourself.'];
    const tags = new Set(lines.map((l) => petVoice(l, { personality: 'supportive' }).split(' ').slice(-2).join(' ')));
    expect(tags.size).toBeGreaterThan(1);
  });

  it('trails off weakly when dying, and drops the personality entirely', () => {
    const weak = petVoice("I'm fading. Please look after me. Really.", { personality: 'energetic', ailments: ['dying', 'starving'] });
    expect(weak).toBe("I'm fading… please look after me…");
    expect(weak).not.toMatch(/!|Ooh|Yes/);
  });

  it('mumbles when foggy — lower case, an "uh", a trailing-off — but keeps a question a question', () => {
    expect(petVoice(LINE, { personality: 'competitive', ailments: ['foggy'] })).toBe('i uh… loved the variety in that meal…');
    expect(petVoice("My head's all foggy. Mind Gym?", { ailments: ['foggy'] })).toBe("my uh… head's all foggy. mind gym?");
  });

  it('adds no flourish to a complaint: the line already says what is wrong', () => {
    const complaint = "I'm so hungry. Feed me?";
    expect(petVoice(complaint, { personality: 'energetic', ailments: ['starving'] })).toBe(complaint);
    expect(petVoice(complaint, { personality: 'competitive', ailments: ['sad'] })).toBe(complaint);
  });

  it('sulks when neglected: a cool opener and none of its personality', () => {
    const sulk = petVoice(LINE, { personality: 'energetic', bond: 'sulking' });
    expect(sulk).toMatch(/^(Oh\. You're back\.|Hm\.|Fine\.) I loved the variety in that meal\.$/);
    expect(sulk).not.toMatch(/Ooh|Yes|Let's go/);
    // Wary is plain: no sulk, but no flourish either.
    expect(petVoice(LINE, { personality: 'energetic', bond: 'wary' })).toBe(LINE);
  });

  it('adds affection when devoted, on top of the personality', () => {
    const devoted = petVoice(LINE, { personality: 'chill', bond: 'devoted' });
    expect(devoted).toMatch(/(No rush|All good|Easy does it)\. (Love you\.|Missed you\.|Stay a while\?)$/);
    // Warm and neutral are just the personality.
    expect(petVoice(LINE, { personality: 'chill', bond: 'warm' })).toBe(petVoice(LINE, { personality: 'chill' }));
  });

  it('lets being unwell outrank the mood of the relationship', () => {
    expect(petVoice("I'm so hungry. Feed me?", { bond: 'sulking', ailments: ['starving'] })).toBe("I'm so hungry. Feed me?");
    expect(petVoice(LINE, { bond: 'devoted', ailments: ['foggy'] })).toBe('i uh… loved the variety in that meal…');
  });

  it('lets dying outrank foggy, the way the sprite does', () => {
    expect(petVoice('I feel weird.', { ailments: ['dying', 'foggy'] })).toBe('I feel weird…');
  });
});
