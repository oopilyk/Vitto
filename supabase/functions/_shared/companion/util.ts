// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/util.ts
// Regenerate with: node scripts/syncCompanion.mjs

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const clamp01 = (n: number) => clamp(n, 0, 1);

export const formatAgo = (ts: number, now: number): string => {
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`;
  const days = Math.round(diff / DAY);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * A moment's calendar date, weekday and hour where the user is. On the phone
 * that is its own clock. The edge functions run on UTC, so there the user's
 * `utcOffsetMinutes` (sent with every request) says where they are: without
 * it a Monday-evening workout in New York was a Tuesday one, and an 8pm
 * check-in counted as night.
 */
export const localParts = (ts: number, utcOffsetMinutes?: number) => {
  if (utcOffsetMinutes !== undefined) {
    const d = new Date(ts + utcOffsetMinutes * MINUTE);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), weekday: d.getUTCDay(), hour: d.getUTCHours() };
  }
  const d = new Date(ts);
  return { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), weekday: d.getDay(), hour: d.getHours() };
};

/** Local calendar day as YYYY-MM-DD, used to group events by day. */
export const dayKey = (ts: number, utcOffsetMinutes?: number): string => {
  const { year, month, date } = localParts(ts, utcOffsetMinutes);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
};

/**
 * The calendar day before a YYYY-MM-DD key. Calendar arithmetic, never "minus
 * 24 hours": a day is 23 or 25 hours long when the clocks change, and stepping
 * by hours there skipped a day or counted one twice.
 */
export const previousDayKey = (key: string): string => {
  const [year, month, date] = key.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! - 1)).toISOString().slice(0, 10);
};

/** Whole calendar days from one YYYY-MM-DD key to another; negative when `to` is earlier. */
export const daysBetweenKeys = (from: string, to: string): number => {
  const utc = (key: string) => {
    const [year, month, date] = key.split('-').map(Number);
    return Date.UTC(year!, month! - 1, date!);
  };
  return Math.round((utc(to) - utc(from)) / DAY);
};

export const timeOfDayFor = (hour: number): 'morning' | 'afternoon' | 'evening' | 'night' =>
  hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night';

const STOPWORDS = new Set(
  'a an the and or but if then so to of in on at for with from by is are was were be been being am i me my mine you your yours it its this that these those do does did doing have has had not no yes just really very about into over than too can will would should could'.split(' '),
);

export const tokenize = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map((w) => (w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w)),
  );

/** Overlap of two token sets against the smaller one, 0..1. */
export const overlap = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
};

/** djb2. Stable across platforms; used wherever a choice must not be random. */
export const hashString = (text: string): number => {
  let value = 5381;
  for (const character of text) value = ((value << 5) + value + character.charCodeAt(0)) >>> 0;
  return value;
};
