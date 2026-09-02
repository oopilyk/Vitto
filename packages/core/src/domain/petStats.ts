import type { HealthEvent, HealthEventType } from './health';
import { clamp, type PetState } from './pet';

/**
 * The stats a pet actually carries. Every one of these is a 0-100 integer in the
 * database, which is what lets the stats screen draw them all on the same scale.
 */
export type PetStatKey =
  | 'health'
  | 'energy'
  | 'happiness'
  | 'nutrition'
  | 'mind'
  | 'recovery'
  | 'strength'
  | 'pushingStrength'
  | 'pullingStrength'
  | 'legStrength'
  | 'endurance';

/**
 * How the stats read to a person: how your pet is doing right now (condition),
 * what it has built up through training (body), and how sharp it feels (mind).
 */
export type PetStatGroup = 'condition' | 'body' | 'mind';

export interface PetStatDescriptor {
  key: PetStatKey;
  label: string;
  group: PetStatGroup;
  /** How this stat is actually raised, read off PetHealthEngine.apply. */
  hint: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Order matters: this is the order the stats screen lists them in. Colour is
 * deliberately absent — that belongs to whichever app is drawing them.
 */
export const PET_STAT_DESCRIPTORS: PetStatDescriptor[] = [
  {
    key: 'health',
    label: 'Health',
    group: 'condition',
    hint: 'Rises with nourishing meals (three or more food groups) and with training.',
  },
  {
    key: 'energy',
    label: 'Energy',
    group: 'condition',
    hint: 'Workouts, walks and good meals lift it. Falls 4 a day when nothing is logged.',
  },
  {
    key: 'happiness',
    label: 'Happiness',
    group: 'condition',
    hint: 'Every care moment lifts it, treats most of all. Falls 3 a day when nothing is logged.',
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    group: 'condition',
    hint: 'Worth 3 for each of protein, vegetables, fruit, whole grains and fiber in a logged meal. Falls 6 a day.',
  },
  {
    key: 'strength',
    label: 'Strength',
    group: 'body',
    hint: 'Overall training load — the more sets you complete in a strength workout, the more it climbs.',
  },
  {
    key: 'pushingStrength',
    label: 'Pushing',
    group: 'body',
    hint: 'Log workout sets for chest, shoulders or triceps.',
  },
  {
    key: 'pullingStrength',
    label: 'Pulling',
    group: 'body',
    hint: 'Log workout sets for back or biceps.',
  },
  {
    key: 'legStrength',
    label: 'Legs',
    group: 'body',
    hint: 'Log workout sets for legs.',
  },
  {
    key: 'endurance',
    label: 'Endurance',
    group: 'body',
    hint: 'Cardio workouts, and days where you walk 8,000 steps or more.',
  },
  {
    key: 'recovery',
    label: 'Recovery',
    group: 'body',
    hint: 'Mobility workouts, and mind sessions answered at 80% accuracy or better.',
  },
  {
    key: 'mind',
    label: 'Mind',
    group: 'mind',
    hint: 'Brain training — up to 8 for a reading session and 6 for maths, scaled by your accuracy. Falls 2 a day.',
  },
];

/**
 * Reads one stat as a 0-100 number. `strength` and `endurance` have no upper
 * bound in the database — only the engine clamps them — so a row written before
 * that clamp existed could still hold a value above 100 and overflow a bar.
 */
export const statValue = (pet: PetState, key: PetStatKey): number => clamp(pet[key]);

/** Day 1 is adoption day itself, so the count is inclusive at both ends. */
export const daysWithPet = (pet: PetState, asOf: Date = new Date()): number =>
  Math.max(1, Math.floor((asOf.getTime() - new Date(pet.adoptedAt).getTime()) / ONE_DAY_MS) + 1);

const emptyCareCounts = (): Record<HealthEventType, number> => ({
  STEP_ACTIVITY: 0,
  WORKOUT: 0,
  MEAL: 0,
  BRAIN_TRAINING: 0,
  SLEEP: 0,
  SCREEN_TIME: 0,
  HYDRATION: 0,
  MANUAL_ACTIVITY: 0,
});

/**
 * How many of each kind of care moment fall inside the last `days` days,
 * counting today as the first of them — so `days: 7` is today plus six before it.
 */
export const careCountsByType = (
  events: HealthEvent[],
  days: number,
  asOf: Date = new Date(),
): Record<HealthEventType, number> => {
  const counts = emptyCareCounts();
  if (days <= 0) return counts;

  const start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  start.setDate(start.getDate() - (days - 1));
  const from = start.getTime();
  // Whole days at both ends, so an event logged later today still counts.
  const until = end.getTime();

  for (const event of events) {
    const at = new Date(event.occurredAt).getTime();
    if (Number.isNaN(at) || at < from || at >= until) continue;
    counts[event.type] += 1;
  }
  return counts;
};
