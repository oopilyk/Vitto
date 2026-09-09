import { describe, expect, it } from 'vitest';
import { PetHealthEngine, applyDelta } from './petHealthEngine';
import { clamp, createPet } from './pet';
import type { HealthEvent, WorkoutStats } from './health';

const event = { id: 'event-1', userId: 'user-1', occurredAt: '2026-08-28T12:00:00Z', type: 'WORKOUT' as const, source: 'manual' as const, metadata: { workoutType: 'strength', durationMinutes: 30, intensity: 'moderate' as const } };

const statsWith = (over: Partial<WorkoutStats>): WorkoutStats => ({
  durationMinutes: 45,
  exerciseCount: 3,
  completedSets: 9,
  totalReps: 72,
  totalVolume: 0,
  muscleGroups: [],
  volumeByMuscleGroup: {},
  bodyweightRepsByMuscleGroup: {},
  ...over,
});

const strengthWorkout = (id: string, occurredAt: string, stats: WorkoutStats): HealthEvent => ({
  id,
  userId: 'user-1',
  occurredAt,
  type: 'WORKOUT',
  source: 'manual',
  metadata: { workoutType: 'strength', durationMinutes: stats.durationMinutes, stats },
});

describe('PetHealthEngine', () => {
  it('turns a workout into bounded progression and a pet reaction', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, event);

    expect(result.pet.strength).toBe(pet.strength + 4);
    expect(result.pet.xp).toBe(18);
    expect(result.reaction.message).toContain('trained');
    expect(result.pet.health).toBeGreaterThanOrEqual(0);
    expect(result.pet.health).toBeLessThanOrEqual(100);
  });

  it('still works as a two-argument call, awarding volume-driven strength with no history', () => {
    const pet = createPet('user-1', 'Miso');
    const workout = strengthWorkout('w-bc', '2026-08-28T12:00:00Z', statsWith({
      volumeByMuscleGroup: { chest: 1800, back: 1200, legs: 3000 },
      totalVolume: 6000,
      muscleGroups: ['chest', 'back', 'legs'],
    }));

    const result = new PetHealthEngine().apply(pet, workout);

    expect(result.pet.pushingStrength).toBeGreaterThan(pet.pushingStrength);
    expect(result.pet.pullingStrength).toBeGreaterThan(pet.pullingStrength);
    expect(result.pet.legStrength).toBeGreaterThan(pet.legStrength);
    expect(result.pet.strength).toBeGreaterThan(pet.strength);
    expect(Number.isInteger(result.pet.strength)).toBe(true);
    expect(result.pet.pushingStrength).toBeLessThanOrEqual(100);
  });

  it('keeps the no-stats workout branch on the old flat formula', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, event, { history: [], bodyWeightKg: 80 });
    expect(result.pet.strength).toBe(pet.strength + 4);
    expect(result.pet.pushingStrength).toBe(pet.pushingStrength);
  });

  it('pays more for a workout that beats the user\'s recent training than one that matches it', () => {
    const pet = createPet('user-1', 'Miso');
    const engine = new PetHealthEngine();
    const history: HealthEvent[] = [
      strengthWorkout('h1', '2026-08-25T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000, muscleGroups: ['chest'] })),
      strengthWorkout('h2', '2026-08-23T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000, muscleGroups: ['chest'] })),
    ];
    const matching = engine.apply(pet, strengthWorkout('m', '2026-08-28T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 1000 }, totalVolume: 1000, muscleGroups: ['chest'] })), { history });
    const beating = engine.apply(pet, strengthWorkout('b', '2026-08-28T12:00:00Z', statsWith({ volumeByMuscleGroup: { chest: 3000 }, totalVolume: 3000, muscleGroups: ['chest'] })), { history });

    expect(beating.reaction.delta.pushingStrength).toBeGreaterThan(matching.reaction.delta.pushingStrength ?? 0);
  });

  it('leaves a cardio workout on its token strength gain and leans on endurance', () => {
    const pet = createPet('user-1', 'Miso');
    const cardio: HealthEvent = {
      id: 'c1', userId: 'user-1', occurredAt: '2026-08-28T12:00:00Z', type: 'WORKOUT', source: 'manual',
      metadata: { workoutType: 'cardio', durationMinutes: 40, stats: statsWith({ bodyweightRepsByMuscleGroup: { cardio: 200 }, muscleGroups: ['cardio'] }) },
    };
    const result = new PetHealthEngine().apply(pet, cardio, { history: [] });
    expect(result.reaction.delta.strength).toBe(1);
    expect(result.reaction.delta.pushingStrength).toBe(0);
    expect(result.reaction.delta.endurance).toBeGreaterThan(0);
  });

  it('rewards a sharp mind session more than a scrappy one', () => {
    const pet = createPet('user-1', 'Miso');
    const engine = new PetHealthEngine();
    const session = (correct: number, total: number) => ({
      id: 'event-2',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'math' as const, correct, total, durationSeconds: 60, score: 80 },
    });

    const sharp = engine.apply(pet, session(9, 10));
    const scrappy = engine.apply(pet, session(3, 10));

    expect(sharp.pet.xp).toBeGreaterThan(scrappy.pet.xp);
    expect(sharp.pet.happiness).toBeGreaterThan(scrappy.pet.happiness);
    expect(sharp.reaction.eventLabel).toBe('Quick maths');
    // Mind is no longer where the score shows up -- sitting down to think
    // clears it either way, and how it went separates the XP and mood above.
    expect(sharp.pet.mind).toBe(100);
    expect(scrappy.pet.mind).toBe(100);
    expect(sharp.pet.recovery).toBeLessThanOrEqual(100);
  });

  it('treats an wordPuzzle session as a sharp one at the accuracy bar', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, {
      id: 'event-4',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'wordPuzzle' as const, correct: 4, total: 5, durationSeconds: 240, score: 84, puzzleDate: '2026-08-28' },
    });

    expect(result.reaction.delta.recovery).toBe(4);
    expect(result.reaction.eventLabel).toBe("Daily word puzzle");
  });

  it('leaves an empty mind session harmless rather than dividing by zero', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, {
      id: 'event-3',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'reading' as const, correct: 0, total: 0, durationSeconds: 40, score: 0 },
    });

    expect(Number.isFinite(result.pet.xp)).toBe(true);
    expect(result.pet.mind).toBeGreaterThanOrEqual(pet.mind);
    expect(result.reaction.eventLabel).toBe('Read and recall');
  });

  it('clears a foggy mind in one session, and reports the real distance travelled', () => {
    const foggy = { ...createPet('user-1', 'Miso'), mind: 6 };
    const result = new PetHealthEngine().apply(foggy, {
      id: 'event-5',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'reading' as const, correct: 5, total: 10, durationSeconds: 90, score: 50 },
    });

    expect(result.pet.mind).toBe(100);
    // The toast reads "+94 mind", not a flat number that would overstate a
    // session done by a pet who was already thinking clearly.
    expect(result.reaction.delta.mind).toBe(94);
  });

  it('asks for nothing when the mind is already clear', () => {
    const sharpPet = { ...createPet('user-1', 'Miso'), mind: 100 };
    const result = new PetHealthEngine().apply(sharpPet, {
      id: 'event-6',
      userId: 'user-1',
      occurredAt: '2026-08-28T12:00:00Z',
      type: 'BRAIN_TRAINING' as const,
      source: 'manual' as const,
      metadata: { game: 'math' as const, correct: 10, total: 10, durationSeconds: 60, score: 100 },
    });

    expect(result.pet.mind).toBe(100);
    expect(result.reaction.delta.mind).toBe(0);
    // The session still counts for everything else.
    expect(result.reaction.delta.xp).toBeGreaterThan(0);
  });
});

describe('MEAL', () => {
  const mealEvent = (metadata: {
    protein?: boolean;
    vegetables?: boolean;
    fruit?: boolean;
    wholeGrains?: boolean;
    fiber?: boolean;
    treats?: boolean;
  }): HealthEvent => ({
    id: 'meal-1',
    userId: 'user-1',
    occurredAt: '2026-08-28T12:00:00Z',
    type: 'MEAL',
    source: 'manual',
    metadata: {
      protein: false,
      vegetables: false,
      fruit: false,
      wholeGrains: false,
      fiber: false,
      treats: false,
      ...metadata,
    },
  });

  it('scales nutrition by the count of nourishing signals present', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(
      pet,
      mealEvent({ protein: true, vegetables: true, fruit: true, wholeGrains: true, fiber: true }),
    );

    expect(result.pet.nutrition).toBe(clamp(pet.nutrition + 15));
  });

  it('gives no nutrition at all when every nourishing signal is absent', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, mealEvent({}));

    expect(result.pet.nutrition).toBe(pet.nutrition);
  });

  it('pays the health and energy bonus once three or more nourishing signals are hit', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(
      pet,
      mealEvent({ protein: true, vegetables: true, fruit: true }),
    );

    expect(result.pet.health).toBe(clamp(pet.health + 2));
    expect(result.pet.energy).toBe(clamp(pet.energy + 3));
  });

  it('withholds the health and energy bonus below the three-signal threshold', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, mealEvent({ protein: true, vegetables: true }));

    expect(result.pet.health).toBe(pet.health);
    expect(result.pet.energy).toBe(pet.energy);
  });

  it('rewards a treat-only meal with the higher happiness bonus, not the plain one', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, mealEvent({ treats: true }));

    expect(result.pet.happiness).toBe(clamp(pet.happiness + 4));
  });

  it('gives the lower happiness bonus to a meal logged without treats', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, mealEvent({ protein: true }));

    expect(result.pet.happiness).toBe(clamp(pet.happiness + 2));
  });

  it('awards a flat 10 xp regardless of how nourishing or indulgent the meal was', () => {
    const pet = createPet('user-1', 'Miso');
    const junkResult = new PetHealthEngine().apply(pet, mealEvent({ treats: true }));
    const balancedResult = new PetHealthEngine().apply(
      pet,
      mealEvent({ protein: true, vegetables: true, fruit: true, wholeGrains: true, fiber: true }),
    );

    expect(junkResult.reaction.delta.xp).toBe(10);
    expect(balancedResult.reaction.delta.xp).toBe(10);
  });

  it('leads with the treat message even when the meal is otherwise fully nourishing', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(
      pet,
      mealEvent({ protein: true, vegetables: true, fruit: true, wholeGrains: true, fiber: true, treats: true }),
    );

    expect(result.reaction.message).toContain('savored the treat');
  });

  it('falls back to the variety message for a treat-free meal', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, mealEvent({ protein: true, vegetables: true, fruit: true }));

    expect(result.reaction.message).toContain('loved the variety');
  });

  it('labels every meal event the same way regardless of its contents', () => {
    const pet = createPet('user-1', 'Miso');
    const result = new PetHealthEngine().apply(pet, mealEvent({ treats: true }));

    expect(result.reaction.eventLabel).toBe('Shared a meal');
  });

  it('never lets a maxed-out pet exceed the 100 cap on nutrition', () => {
    const pet = { ...createPet('user-1', 'Miso'), nutrition: 95 };
    const result = new PetHealthEngine().apply(
      pet,
      mealEvent({ protein: true, vegetables: true, fruit: true, wholeGrains: true, fiber: true }),
    );

    expect(result.pet.nutrition).toBe(100);
  });
});

describe('SLEEP', () => {
  const sleepEvent = (asleepMinutes: number): HealthEvent => ({
    id: 'sleep-1',
    userId: 'user-1',
    occurredAt: '2026-09-03T06:00:00Z',
    type: 'SLEEP',
    source: 'healthkit',
    metadata: { asleepMinutes, night: '2026-09-03' },
  });

  it('restores the most energy for a full night', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20, recovery: 20 };
    const { pet: rested, reaction } = new PetHealthEngine().apply(pet, sleepEvent(8 * 60));
    expect(rested.energy).toBe(34);
    expect(rested.recovery).toBe(25);
    expect(reaction.eventLabel).toBe('Rested up');
  });

  it('gives less for a short night than a full one', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20 };
    const engine = new PetHealthEngine();
    const short = engine.apply(pet, sleepEvent(6 * 60)).pet.energy;
    const full = engine.apply(pet, sleepEvent(8 * 60)).pet.energy;
    expect(short).toBeLessThan(full);
    expect(short).toBe(29);
  });

  it('still rewards a bad night rather than punishing it', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20, happiness: 40 };
    const { pet: rested } = new PetHealthEngine().apply(pet, sleepEvent(3 * 60));
    expect(rested.energy).toBeGreaterThan(pet.energy);
    expect(rested.happiness).toBe(40);
  });

  it('reports the hours slept in the reaction message', () => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const { reaction } = new PetHealthEngine().apply(pet, sleepEvent(7 * 60 + 30));
    expect(reaction.message).toContain('7.5h');
  });

  it('treats a missing or negative duration as a bad night, not a crash', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), energy: 20 };
    const { pet: rested } = new PetHealthEngine().apply(pet, sleepEvent(-10));
    expect(rested.energy).toBe(24);
  });
});

describe('SCREEN_TIME', () => {
  const screenTime = (minutes: number, budgetMinutes?: number): HealthEvent => ({
    id: 'screen-1',
    userId: 'user-1',
    occurredAt: '2026-09-05T21:00:00Z',
    type: 'SCREEN_TIME',
    source: 'manual',
    metadata: {
      minutes,
      date: '2026-09-05',
      source: 'manual',
      budgetMinutes,
      withinBudget: budgetMinutes === undefined ? undefined : minutes <= budgetMinutes,
    },
  });

  it('restores mind for a light day, with the sleep-sized side rewards', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), mind: 40, happiness: 40, recovery: 40 };
    const { pet: next, reaction } = new PetHealthEngine().apply(pet, screenTime(95, 120));
    expect(next.mind).toBe(45);
    expect(next.happiness).toBe(43);
    expect(next.recovery).toBe(42);
    // The light band pays 14, plus 3 for also clearing the user's own budget.
    expect(reaction.delta.xp).toBe(17);
    expect(reaction.eventLabel).toBe('Unplugged');
    expect(reaction.message).toContain('1h 35m');
    expect(reaction.message).toContain('2h budget');
  });

  it('never lowers a stat for a day over budget, and still acknowledges the log', () => {
    const pet = { ...createPet('user-1', 'Blue', 'dog'), mind: 40, happiness: 40, recovery: 40, energy: 40 };
    const { pet: next, reaction } = new PetHealthEngine().apply(pet, screenTime(300, 120));
    for (const key of ['mind', 'happiness', 'recovery', 'energy', 'health', 'nutrition'] as const) {
      expect(next[key]).toBeGreaterThanOrEqual(pet[key]);
    }
    expect(next.mind).toBe(40);
    // Five hours is the `heavy` band: xp only, and no stat moves down.
    expect(reaction.delta).toEqual({ xp: 8 });
    expect(reaction.eventLabel).toBe('Screen check-in');
    expect(reaction.message).not.toMatch(/too much|bad|over/i);
  });

  it('still grades a log with no budget set, since the bands do not need one', () => {
    // The budget used to be the only yardstick, so a user without one got a
    // neutral log however long the day was. The bands are a shared scale, so the
    // day is graded either way and the budget is just a bonus on top.
    const pet = { ...createPet('user-1', 'Blue', 'dog'), mind: 40, happiness: 40 };
    const { pet: next, reaction } = new PetHealthEngine().apply(pet, screenTime(200));
    expect(next.mind).toBe(43);
    expect(next.happiness).toBe(41);
    expect(reaction.delta.xp).toBe(11);
    expect(reaction.message).toContain('3h 20m');
  });

  it.each([
    [60, 'a good day', 'Unplugged'],
    [200, 'fine', 'Screen check-in'],
    [330, 'pushing it', 'Screen check-in'],
    [540, 'a lot', 'Screen check-in'],
  ])('grades %i minutes as "%s"', (minutes, verdict, label) => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const { reaction } = new PetHealthEngine().apply(pet, screenTime(minutes as number));
    expect(reaction.message).toContain(verdict as string);
    expect(reaction.eventLabel).toBe(label as string);
  });

  it('pays less as the day gets heavier, but never nothing and never a penalty', () => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const engine = new PetHealthEngine();
    const xp = [60, 200, 330, 540].map(
      (minutes) => engine.apply(pet, screenTime(minutes)).reaction.delta.xp ?? 0,
    );
    expect(xp).toEqual([...xp].sort((a, b) => b - a));
    expect(Math.min(...xp)).toBeGreaterThan(0);
    for (const minutes of [60, 200, 330, 540]) {
      const delta = engine.apply(pet, screenTime(minutes)).reaction.delta;
      for (const value of Object.values(delta)) {
        expect(value as number).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('pays less for an over-budget day than an under-budget one, and less than a brain session', () => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const engine = new PetHealthEngine();
    const under = engine.apply(pet, screenTime(60, 120)).reaction.delta.xp ?? 0;
    const over = engine.apply(pet, screenTime(240, 120)).reaction.delta.xp ?? 0;
    expect(over).toBeLessThan(under);
    expect(under).toBeLessThanOrEqual(24);
  });

  it('derives the verdict from minutes and budget when the flag was not precomputed', () => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const event = screenTime(90, 120);
    delete (event.metadata as { withinBudget?: boolean }).withinBudget;
    expect(new PetHealthEngine().apply(pet, event).reaction.eventLabel).toBe('Unplugged');
  });

  it('shrugs off a negative or non-finite total rather than crashing', () => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const { reaction } = new PetHealthEngine().apply(pet, screenTime(-30, 120));
    expect(reaction.message).toContain('0m');
    expect(Number.isFinite(reaction.delta.xp)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('reads a %s total as zero minutes, never as "NaNh"', (minutes) => {
    const pet = createPet('user-1', 'Blue', 'dog');
    const event = screenTime(minutes, 120);
    delete (event.metadata as { withinBudget?: boolean }).withinBudget;
    const { reaction } = new PetHealthEngine().apply(pet, event);
    expect(reaction.message).toContain('0m');
    expect(reaction.message).not.toMatch(/NaN|Infinity/);
    expect(Number.isFinite(reaction.delta.xp)).toBe(true);
  });
});

describe('applyDelta lastEventAt', () => {
  const anchor = '2026-09-07T12:00:00.000Z';
  const pet = { ...createPet('user-1', 'Miso'), lastEventAt: anchor };

  it('keeps the later anchor when the event is older than it', () => {
    // A care partner's log can post-date a HealthKit import; rewinding the
    // anchor would make the next decay pass charge for a window already settled.
    const next = applyDelta(pet, { xp: 5 }, '2026-09-06T12:00:00.000Z');

    expect(next.lastEventAt).toBe(anchor);
    expect(next.xp).toBe(pet.xp + 5);
  });

  it('moves the anchor forward when the event is newer', () => {
    const next = applyDelta(pet, { xp: 5 }, '2026-09-08T12:00:00.000Z');

    expect(next.lastEventAt).toBe('2026-09-08T12:00:00.000Z');
  });

  it('takes the event time when the pet has no anchor yet', () => {
    const next = applyDelta(createPet('user-1', 'Miso'), { xp: 5 }, '2026-09-08T12:00:00.000Z');

    expect(next.lastEventAt).toBe('2026-09-08T12:00:00.000Z');
  });
});
