import { describe, expect, it } from 'vitest';
import { oneRepMaxFrom, renderLiftMath, repsAt, setsMentioned } from './liftMath';
import { sanitizeLifeContext } from './context';

describe('lift math, worked out before the pet sees it', () => {
  it('gets 225 x 8 right: about 285, not 543', () => {
    expect(Math.round(oneRepMaxFrom(225, 8))).toBe(285);
    expect(repsAt(285, 225)).toBe(8);
    expect(repsAt(285, 285)).toBe(1);
    expect(repsAt(285, 315)).toBe(0);
  });

  it('reads sets out of chat, and leaves times and step counts alone', () => {
    expect(setsMentioned('i did 225 for 8 yesterday')).toEqual([{ weight: 225, reps: 8 }]);
    expect(setsMentioned('100kg x 5 and 185 lbs for 10 reps')).toEqual([
      { weight: 100, reps: 5, unit: 'kg' },
      { weight: 185, reps: 10, unit: 'lb' },
    ]);
    expect(setsMentioned('ran 45 for 20 minutes, 2000 for 30 days')).toEqual([]);
    expect(setsMentioned('whats my max bench')).toEqual([]);
  });

  it('hands the pet the max and a rep table, never a formula', () => {
    const life = { ...sanitizeLifeContext({}), lifts: [{ lift: 'Bench', unit: 'lb' as const, oneRepMax: 285, from: 'Bench Press 225 lb x 8' }] };
    const text = renderLiftMath(life, ['how many can i do at 225', 'what about 135 for 12']).join('\n');
    expect(text).toContain('one-rep max about 285 lb (from Bench Press 225 lb x 8)');
    expect(text).toContain('225 x 8');
    expect(text).toContain('135 lb x 12: one-rep max about 189 lb');
    // Said 12 at 135: the table agrees, rather than capping it at 10.
    expect(text).toMatch(/189 lb\. Reps it is good for: .*135 x 12/);
  });
});
