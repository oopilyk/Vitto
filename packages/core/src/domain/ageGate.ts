/**
 * The age check at sign-up.
 *
 * Vitto is not for children under 13 (US COPPA, and the privacy policy says
 * so). The check follows the FTC's guidance for a neutral age screen: it asks
 * for a birthday rather than a yes/no "are you over 13?", which invites the
 * answer it is fishing for. Month and year, because a year alone cannot tell a
 * 12-year-old from a 13-year-old for most of the year.
 */
export const MINIMUM_AGE = 13;

export type BirthdayCheck =
  | { ok: true }
  | { ok: false; reason: 'incomplete' | 'invalid' | 'too-young' };

/**
 * Whether someone born in `month` (1-12) of `year` is at least MINIMUM_AGE on
 * `now`. Taken as born on the last day of that month, so anyone whose 13th
 * birthday might still be ahead this month is not yet let through.
 */
export const checkBirthday = (month: string, year: string, now = new Date()): BirthdayCheck => {
  if (!month.trim() || year.trim().length < 4) return { ok: false, reason: 'incomplete' };
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) return { ok: false, reason: 'invalid' };
  if (!Number.isInteger(y) || y < now.getFullYear() - 120 || y > now.getFullYear()) return { ok: false, reason: 'invalid' };
  const birthMonthIndex = y * 12 + (m - 1);
  const nowMonthIndex = now.getFullYear() * 12 + now.getMonth();
  if (birthMonthIndex > nowMonthIndex) return { ok: false, reason: 'invalid' };
  // Whole months lived, counting the birth month as not yet complete.
  const monthsOld = nowMonthIndex - birthMonthIndex - 1;
  return monthsOld >= MINIMUM_AGE * 12 ? { ok: true } : { ok: false, reason: 'too-young' };
};
