import type { HealthEvent, MealMetadata, StepMetadata, WorkoutMetadata } from './health';
import { clamp, type PetDelta, type PetMood, type PetReaction, type PetState } from './pet';

export interface EngineResult {
  pet: PetState;
  reaction: PetReaction;
}

const HUNGRY_NUTRITION_THRESHOLD = 35;
const SLEEPY_ENERGY_THRESHOLD = 40;
const BRIGHT_ENERGY_THRESHOLD = 65;
const BRIGHT_HAPPINESS_THRESHOLD = 65;

export const determineMood = (energy: number, nutrition: number, happiness: number): PetMood => {
  if (nutrition < HUNGRY_NUTRITION_THRESHOLD) return 'hungry';
  if (energy < SLEEPY_ENERGY_THRESHOLD) return 'sleepy';
  if (energy >= BRIGHT_ENERGY_THRESHOLD && happiness >= BRIGHT_HAPPINESS_THRESHOLD) return 'bright';
  return 'content';
};

export const applyDelta = (pet: PetState, delta: PetDelta, occurredAt: string): PetState => {
  const nextXp = pet.xp + (delta.xp ?? 0);
  const nextLevel = pet.level + Math.floor(nextXp / 100);
  const nextEnergy = clamp(pet.energy + (delta.energy ?? 0));
  const nextNutrition = clamp(pet.nutrition + (delta.nutrition ?? 0));
  const nextHappiness = clamp(pet.happiness + (delta.happiness ?? 0));
  return {
    ...pet,
    level: nextLevel,
    xp: nextXp % 100,
    health: clamp(pet.health + (delta.health ?? 0)),
    energy: nextEnergy,
    happiness: nextHappiness,
    nutrition: nextNutrition,
    strength: clamp(pet.strength + (delta.strength ?? 0), 0, 100),
    pushingStrength: clamp(pet.pushingStrength + (delta.pushingStrength ?? 0), 0, 100),
    pullingStrength: clamp(pet.pullingStrength + (delta.pullingStrength ?? 0), 0, 100),
    legStrength: clamp(pet.legStrength + (delta.legStrength ?? 0), 0, 100),
    endurance: clamp(pet.endurance + (delta.endurance ?? 0), 0, 100),
    recovery: clamp(pet.recovery + (delta.recovery ?? 0)),
    mood: determineMood(nextEnergy, nextNutrition, nextHappiness),
    lastEventAt: occurredAt,
  };
};

export class PetHealthEngine {
  apply(pet: PetState, event: HealthEvent): EngineResult {
    let delta: PetDelta;
    let message: string;
    let eventLabel: string;

    switch (event.type) {
      case 'WORKOUT': {
        const metadata = event.metadata as unknown as WorkoutMetadata;
        const hardBonus = metadata.intensity === 'hard' ? 2 : 0;
        const hasWorkoutStats = Boolean(metadata.stats);
        const sets = Math.min(30, metadata.stats?.completedSets ?? 0);
        const durationBonus = Math.min(8, Math.floor(Math.min(120, metadata.durationMinutes) / 30));
        const cardio = metadata.workoutType === 'cardio';
        const muscles = metadata.stats?.muscleGroups ?? [];
        const pushBonus = muscles.some((group) => ['chest', 'shoulders', 'triceps'].includes(group)) ? 4 : 0;
        const pullBonus = muscles.some((group) => ['back', 'biceps'].includes(group)) ? 4 : 0;
        const legBonus = muscles.includes('legs') ? 4 : 0;
        delta = hasWorkoutStats
          ? { health: 2, energy: 6, happiness: 5, strength: cardio ? 1 : Math.min(5, 2 + Math.floor(sets / 8)), pushingStrength: pushBonus, pullingStrength: pullBonus, legStrength: legBonus, endurance: cardio ? Math.min(5, 2 + Math.floor(sets / 8)) : 2, recovery: metadata.name?.toLowerCase().includes('mobility') ? 3 : 0, xp: Math.min(40, 10 + Math.min(15, sets) + durationBonus + hardBonus) }
          : { energy: 6, happiness: 5, strength: metadata.workoutType === 'strength' ? 4 : 1, endurance: 2, xp: 18 + hardBonus };
        message = `${pet.name} trained for ${metadata.durationMinutes} minutes and feels stronger.`;
        eventLabel = `Trained ${metadata.workoutType}`;
        break;
      }
      case 'STEP_ACTIVITY': {
        const metadata = event.metadata as unknown as StepMetadata;
        const milestone = metadata.steps >= 8000;
        delta = { energy: milestone ? 7 : 3, happiness: 4, endurance: milestone ? 3 : 1, xp: milestone ? 16 : 8 };
        message = milestone ? `${pet.name} explored somewhere new today.` : `${pet.name} enjoyed a little walk with you.`;
        eventLabel = milestone ? 'Explored the wilds' : 'Went for a walk';
        break;
      }
      case 'MEAL': {
        const meal = event.metadata as unknown as MealMetadata;
        const nourishingSignals = [meal.protein, meal.vegetables, meal.fruit, meal.wholeGrains, meal.fiber].filter(Boolean).length;
        delta = { nutrition: nourishingSignals * 3, health: nourishingSignals >= 3 ? 2 : 0, happiness: meal.treats ? 4 : 2, energy: nourishingSignals >= 3 ? 3 : 0, xp: 10 };
        message = meal.treats ? `${pet.name} savored the treat. Balance feels good.` : `${pet.name} loved the variety in that meal.`;
        eventLabel = 'Shared a meal';
        break;
      }
      default:
        delta = { happiness: 2, xp: 5 };
        message = `${pet.name} noticed you taking care of yourself.`;
        eventLabel = 'A healthy moment';
    }

    return { pet: applyDelta(pet, delta, event.occurredAt), reaction: { message, eventLabel, delta } };
  }
}
