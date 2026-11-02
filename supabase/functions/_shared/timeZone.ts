/**
 * Minutes east of UTC that `zone` (an IANA name such as "America/New_York")
 * is at the moment `at`, from the zone's own rules, so a clock change counts
 * from the minute it happens. The offset a phone reported only changes when
 * the app is next opened, which left quiet hours and evening nudges an hour
 * out after every clock change. Null for anything that is not a zone this
 * runtime knows; callers then fall back to the reported offset.
 */
export const zoneOffsetMinutes = (zone: unknown, at: number): number | null => {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return null;
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(at))
      .find((part) => part.type === 'timeZoneName')?.value;
    if (name === 'GMT') return 0;
    const match = name ? /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name) : null;
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return match[1] === '-' ? -minutes : minutes;
  } catch {
    return null;
  }
};
