import { describe, expect, it } from 'vitest';
import { ageFromBirthYear, birthYearFromAge, birthYearToSave, checkBirthYear, checkBirthday, withCurrentAge } from './ageGate';

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

describe('checkBirthYear', () => {
  const now = new Date(2026, 9, 9); // 9 Oct 2026
  it('settles most ages from the year alone, and asks the month only on the boundary', () => {
    expect(checkBirthYear('1976', '', now)).toEqual({ ok: true, age: 50 });
    expect(checkBirthYear('2015', '', now)).toEqual({ ok: false, reason: 'too-young' });
    expect(checkBirthYear('2013', '', now)).toEqual({ ok: false, reason: 'needs-month' });
    expect(checkBirthYear('2013', '3', now)).toEqual({ ok: true, age: 13 });
    expect(checkBirthYear('2013', '11', now)).toEqual({ ok: false, reason: 'too-young' });
  });
  it('turns away nonsense and waits for four digits', () => {
    expect(checkBirthYear('199', '', now)).toEqual({ ok: false, reason: 'incomplete' });
    expect(checkBirthYear('2031', '', now)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBirthYear('1850', '', now)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('ages going up on their own', () => {
  const spring = new Date(2026, 2, 1);
  const autumn = new Date(2026, 9, 1);
  const nextAutumn = new Date(2027, 9, 1);

  it('turns a birth year into an age, with the birthday taken as mid-year', () => {
    expect(ageFromBirthYear(2009, spring)).toBe(16);
    expect(ageFromBirthYear(2009, autumn)).toBe(17);
    expect(birthYearFromAge(17, autumn)).toBe(2009);
    expect(birthYearFromAge(16, spring)).toBe(2009);
  });

  it('gives an old profile a birth year, and from then on it ages: 17 now is an adult next year', () => {
    const loaded = withCurrentAge({ age: 17 }, autumn);
    expect(loaded).toEqual({ age: 17, birthYear: 2009 });
    expect(withCurrentAge(loaded, nextAutumn).age).toBe(18);
  });

  it('follows an edited age when saving, and keeps the stored year otherwise', () => {
    expect(birthYearToSave({ age: 17, birthYear: 2009 }, autumn)).toBe(2009);
    expect(birthYearToSave({ age: 25, birthYear: 2009 }, autumn)).toBe(2001);
  });
});
