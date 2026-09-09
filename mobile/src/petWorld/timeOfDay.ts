/**
 * Whether an environment should show its night dressing. A fixed clock-hour
 * band rather than a real sunset calculation (which would need geolocation) --
 * "past sunset" approximated as after 7pm and before 6am, which covers actual
 * sunset across the times of year/latitude this app's users are in without
 * pulling in a location/astronomy dependency for a cosmetic backdrop.
 */
export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 6;

export const isNightTime = (now: Date = new Date()): boolean => {
  const hour = now.getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
};
