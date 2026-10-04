import { describe, expect, it } from 'vitest';
import { checkBirthday } from './ageGate';

describe('checkBirthday', () => {
  const now = new Date(2026, 9, 4); // 4 October 2026

  it('lets in anyone clearly 13 or older', () => {
    expect(checkBirthday('6', '2000', now)).toEqual({ ok: true });
    expect(checkBirthday('9', '2013', now)).toEqual({ ok: true }); // turned 13 by the end of September
  });

  it('refuses anyone under 13', () => {
    expect(checkBirthday('1', '2015', now)).toEqual({ ok: false, reason: 'too-young' });
    expect(checkBirthday('11', '2013', now)).toEqual({ ok: false, reason: 'too-young' }); // 13 next month
  });

  it('refuses someone whose 13th birthday may still be ahead this month', () => {
    expect(checkBirthday('10', '2013', now)).toEqual({ ok: false, reason: 'too-young' });
  });

  it('waits for a complete birthday, and rejects impossible ones', () => {
    expect(checkBirthday('', '2000', now)).toEqual({ ok: false, reason: 'incomplete' });
    expect(checkBirthday('6', '20', now)).toEqual({ ok: false, reason: 'incomplete' });
    expect(checkBirthday('13', '2000', now)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBirthday('6', '1850', now)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBirthday('12', '2026', now)).toEqual({ ok: false, reason: 'invalid' });
  });
});
