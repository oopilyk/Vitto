import { DECAY_PER_DAY } from './decay';
import { HUNGRY_NUTRITION_THRESHOLD } from './hunger';
import { SLEEPY_ENERGY_THRESHOLD, SLUGGISH_VITALITY_THRESHOLD } from './petHealthEngine';
import type { HealthEvent, HealthEventType } from './health';
import { chargeOf, clamp, type PetState } from './pet';

/**
 * The stats a pet actually carries. Every one of these is a 0-100 integer in the
 * database, which is what lets the stats screen draw them all on the same scale.
 */
export type PetStatKey =
  | 'health'
  | 'energy'
  | 'charge'
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
  /**
   * How this stat moves, in the app's own voice: how it is raised (read off
   * PetHealthEngine.apply) and, for the needs that decline, how fast it falls.
   * Decline rates are interpolated from DECAY_PER_DAY so the copy cannot drift
   * away from the engine.
   */
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
    hint: 'What you eat moves it: a balanced plate adds up to 3, junk takes 3 or more. It also holds up while hunger, vitality and happiness stay in good shape, and slips away for every one of them you let run empty.',
  },
  {
    key: 'energy',
    label: 'Vitality',
    group: 'condition',
    hint: `Your pet's get-up-and-go: workouts and walks build it. Under ${SLUGGISH_VITALITY_THRESHOLD} your pet turns sluggish. Falls ${DECAY_PER_DAY.energy} a day when nothing is logged.`,
  },
  {
    key: 'charge',
    label: 'Energy',
    group: 'condition',
    hint: `Sleep and meals fill it: a full night's sleep most of all, a balanced plate more than a snack. Under ${SLEEPY_ENERGY_THRESHOLD} your pet gets sleepy. Falls ${DECAY_PER_DAY.charge} a day.`,
  },
  {
    key: 'happiness',
    label: 'Happiness',
    group: 'condition',
    hint: `Every care moment lifts it, treats most of all. Falls ${DECAY_PER_DAY.happiness} a day when nothing is logged.`,
  },
  {
    key: 'nutrition',
    label: 'Hunger',
    group: 'condition',
    hint: `What you ate in the last 24 hours, against what your body burns in a day: eat your maintenance and the bar is full. Each meal wears off a day after you ate it, and under ${HUNGRY_NUTRITION_THRESHOLD} your pet is hungry. What was on the plate counts toward health, not here.`,
  },
  {
    key: 'strength',
    label: 'Strength',
    group: 'body',
    hint: 'Total lifting volume (weight times reps) in a strength workout, scored against what you have been lifting lately. Beat your recent average to climb, match it to hold — and the closer to 100, the harder each point.',
  },
  {
    key: 'pushingStrength',
    label: 'Pushing',
    group: 'body',
    hint: 'The chest, shoulder and triceps share of that volume, measured the same way — more than your recent push days to climb.',
  },
  {
    key: 'pullingStrength',
    label: 'Pulling',
    group: 'body',
    hint: 'The back and biceps share of that volume, measured the same way — more than your recent pull days to climb.',
  },
  {
    key: 'legStrength',
    label: 'Legs',
    group: 'body',
    hint: 'The leg share of that volume, measured the same way — more than your recent leg days to climb.',
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
    hint: `Brain training — up to 8 for a reading session and 6 for maths, scaled by your accuracy — and 5 for a day that stays under your screen-time budget. Falls ${DECAY_PER_DAY.mind} a day.`,
  },
];

/**
 * Reads one stat as a 0-100 number. `strength` and `endurance` have no upper
 * bound in the database — only the engine clamps them — so a row written before
 * that clamp existed could still hold a value above 100 and overflow a bar.
 */
export const statValue = (pet: PetState, key: PetStatKey): number => clamp(key === 'charge' ? chargeOf(pet) : pet[key]);

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
