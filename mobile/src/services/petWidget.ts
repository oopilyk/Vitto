import { Platform } from 'react-native';
import { WATER_CUP_ML, buildDailyRecap, dayGoals, estimateCaloriesBurned, getEventsForDay, measurementSystemOf, scheduleDayOn, type TrainingSchedule, type WorkoutTemplate, type BodyProfile, type HealthEvent, type PetState } from '@vitto/core';
import { takePendingWater } from '../../modules/pet-island';
import { setWidgetSnapshot } from '../../modules/pet-island';
import { buildIslandState } from './petIsland';

/**
 * The Home Screen widget's snapshot: the pet as the Island sees it, plus
 * today's food and steps from the same recap the Today page draws.
 *
 * The widget only reads what this writes, so it is written whenever any of it
 * changes, and its timeline (targets/pet-island/PetWidget.swift) covers the
 * rest: the coming need, and midnight putting the day's numbers back to zero.
 * Separate from the Island setting: the widget is something the person put on
 * their Home Screen themselves.
 */
export interface WidgetSnapshot {
  name: string;
  sprite: string;
  headline: string;
  mood: string;
  nextNeedAt?: number;
  nextNeed?: string;
  dayStartsAt: number;
  dayEndsAt: number;
  calories: number;
  calorieTarget: number;
  proteinGrams: number;
  proteinTarget: number;
  steps: number;
  stepGoal: number;
  /** Water today and the day's aim, in mL; a cup is `cupMl`. The widget's + adds one (LogWaterIntent). */
  waterMl: number;
  waterGoalMl: number;
  cupMl: number;
  /** fl oz rather than mL on the widget. */
  imperial: boolean;
  /** Burned today, which adds to what is left to eat (as on Today's Food card). */
  caloriesBurned: number;
  /** The main screen's "kcal left / Day 2 · Push / steps left" chips, for the Lock Screen widget. */
  goals: { label: string; done: boolean }[];
}

const seconds = (ms: number) => Math.round(ms / 1000);

export const buildWidgetSnapshot = (
  input: {
    pet: PetState;
    events: HealthEvent[];
    profile: BodyProfile;
    stepGoal: number;
    /** The training rotation, so the widget's workout chip matches the main screen's. */
    schedule?: TrainingSchedule | null;
    templates?: readonly WorkoutTemplate[];
  },
  now: Date = new Date(),
): WidgetSnapshot => {
  const island = buildIslandState(input.pet, now.getTime(), input.pet.careAreas);
  const recap = buildDailyRecap({ ...input, day: now });
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    name: island.name,
    sprite: island.sprite,
    headline: island.headline,
    mood: island.mood,
    ...(island.nextNeedAt !== undefined ? { nextNeedAt: island.nextNeedAt, nextNeed: island.nextNeed } : {}),
    dayStartsAt: seconds(dayStart.getTime()),
    dayEndsAt: seconds(dayEnd.getTime()),
    calories: Math.round(recap.food.consumed.calories),
    calorieTarget: Math.round(recap.food.targets.calories),
    proteinGrams: Math.round(recap.food.consumed.proteinGrams),
    proteinTarget: Math.round(recap.food.targets.proteinGrams),
    steps: recap.outdoors.steps,
    stepGoal: recap.outdoors.goal,
    waterMl: Math.max(0, Math.round(recap.food.waterMl)),
    waterGoalMl: recap.food.waterGoalMl,
    cupMl: WATER_CUP_ML,
    imperial: measurementSystemOf(input.profile) === 'imperial',
    caloriesBurned: Math.round(estimateCaloriesBurned(getEventsForDay(input.events, now))),
    goals: dayGoals(recap, { ...input, day: now, rotation: scheduleDayOn(input.schedule, input.templates ?? [], now) }).map(({ label, done }) => ({ label, done })),
  };
};

/** What was last written, so an unchanged widget is not woken (WidgetKit budgets redraws). */
let lastWritten: string | null = null;

/**
 * The coming need's moment is worked out afresh each time and moves by a
 * second or two between calls; rounded to the minute it only changes when the
 * pet does.
 */
const comparable = (snapshot: WidgetSnapshot): string =>
  JSON.stringify({ ...snapshot, nextNeedAt: snapshot.nextNeedAt === undefined ? undefined : Math.round(snapshot.nextNeedAt / 60) });

export const syncPetWidget = async (snapshot: WidgetSnapshot): Promise<void> => {
  if (Platform.OS !== 'ios') return;
  const key = comparable(snapshot);
  if (key === lastWritten) return;
  lastWritten = key;
  await setWidgetSnapshot(JSON.stringify(snapshot));
};

export const clearPetWidget = async (): Promise<void> => {
  if (Platform.OS !== 'ios') return;
  lastWritten = null;
  await setWidgetSnapshot(null);
};

/**
 * Cups added from the widget's + while the app was closed, each with when it
 * was tapped. Taken once: the list is emptied as it is read, so each cup is
 * logged one time.
 */
export const drainWidgetWater = async (): Promise<{ ml: number; at: Date }[]> => {
  if (Platform.OS !== 'ios') return [];
  const raw = await takePendingWater();
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as { ml: number; at: number }[];
    return list
      .filter((item) => Number.isFinite(item.ml) && item.ml > 0 && Number.isFinite(item.at))
      .map((item) => ({ ml: item.ml, at: new Date(item.at * 1000) }));
  } catch {
    return [];
  }
};
