import type { HealthEvent, MealMetadata } from './health';
import { isRemoved } from './removedEvents';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * The slot a meal eaten at this time most likely is: breakfast until 11,
 * lunch until 3, dinner from 5 to 10, and a snack between and after. Only
 * the starting choice; the meal sheet lets it be changed.
 */
export const slotForTime = (at: Date): MealSlot => {
  const hour = at.getHours() + at.getMinutes() / 60;
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
};

/** A meal's slot: the one chosen when it was logged, or, for older meals, read off its time. */
export const mealSlotOf = (meal: HealthEvent<unknown>): MealSlot =>
  (meal.metadata as MealMetadata).slot ?? slotForTime(new Date(meal.occurredAt));

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** One day's meals in a slot, oldest first. Removed ones are not meals any more. */
export const mealsInSlot = (events: readonly HealthEvent[], day: Date, slot: MealSlot): HealthEvent<MealMetadata>[] =>
  events
    .filter((event): event is HealthEvent<MealMetadata> => event.type === 'MEAL' && !isRemoved(event))
    .filter((event) => sameDay(new Date(event.occurredAt), day) && mealSlotOf(event) === slot)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

/**
 * What "Copy yesterday's breakfast" would log: yesterday's meals in `slot`,
 * unless that slot already has something in it today (then it has been eaten
 * or copied already, and offering it again only invites a double).
 */
export const copyableSlot = (events: readonly HealthEvent[], slot: MealSlot, now: Date = new Date()): HealthEvent<MealMetadata>[] => {
  if (mealsInSlot(events, now, slot).length > 0) return [];
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  return mealsInSlot(events, yesterday, slot);
};
