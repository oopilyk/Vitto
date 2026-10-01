const MINUTES_PER_DAY = 24 * 60;

/** "2h 05m"; whole minutes in, so no rounding surprises. */
export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

/**
 * Joins an hours + minutes pair. An empty pair and a zero total both mean "no
 * value": zero is "no budget" to the engine, the mapping and the database check
 * alike, so it must never be stored as a number. A pair with an unparsable half
 * (the field accepts "1.2.3") yields NaN, which callers gate on with
 * Number.isFinite.
 */
export const joinMinutes = (hours: number | undefined, minutes: number | undefined): number | undefined => {
  if (hours === undefined && minutes === undefined) return undefined;
  const total = Math.round((hours ?? 0) * 60 + (minutes ?? 0));
  if (!Number.isFinite(total)) return Number.NaN;
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, total));
  return clamped === 0 ? undefined : clamped;
};
