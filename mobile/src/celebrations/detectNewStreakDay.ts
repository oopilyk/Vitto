import type { HealthEvent } from '@vitto/core';
import { calculateQualifyingStreaks, createsNewStreakDay } from '@vitto/core';
import type { CelebrationEvent } from './types';

/**
 * The single, authoritative "this care moment just started a new streak day"
 * check — mirrors `detectLevelUp`'s shape exactly, for the same reason.
 *
 * Called in `App.tsx`'s `recordEvent`, with `existingEvents` being the user's
 * own events *before* this one is added. It fires on the real transition
 * (today had no qualifying activity, and this event is one) rather than on
 * "the streak number is bigger than it used to be", so a refresh, a
 * navigation, or a second meal the same day never re-raises it — none of
 * those add a new event, and a second qualifying event the same day doesn't
 * create a new day.
 *
 * `petId` is the on-screen pet: the streak is the user's, not a per-pet
 * count, but the celebration still needs to know which pet to show.
 */
export function detectNewStreakDay(
  existingEvents: HealthEvent[],
  event: HealthEvent,
  petId: string,
): CelebrationEvent | null {
  if (!createsNewStreakDay(existingEvents, event)) return null;
  const streak = calculateQualifyingStreaks([...existingEvents, event], new Date(event.occurredAt)).currentStreak;
  return { kind: 'streak', petId, streak };
}
