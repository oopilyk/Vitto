import {
  DECAY_PERIOD_MS,
  type HealthEvent,
  PROFILE_SURVEY_DEFAULTS,
  type PetSaveResult,
  type PetState,
  PetHealthEngine,
  type StepMetadata,
  applyTimeDecay,
  createPet,
} from '@vitto/core';
import { careConflictMessage, commitCareMoment, commitCareMomentForAll, planCareMoment } from '../services/careMoment';

const engine = new PetHealthEngine();

const profile = {
  age: 30,
  sex: 'other' as const,
  heightCm: 175,
  heightUnit: 'cm' as const,
  weightKg: 74,
  weightUnit: 'kg' as const,
  activity: 'moderate' as const,
  goal: 'maintain' as const,
  ...PROFILE_SURVEY_DEFAULTS,
};

const now = Date.now();

/** A short walk: +3 energy, small and unclamped, so the assertions can reason about it. */
const walk: HealthEvent<StepMetadata> = {
  id: 'walk-1',
  userId: 'user-1',
  occurredAt: new Date(now).toISOString(),
  type: 'STEP_ACTIVITY',
  source: 'manual',
  metadata: { steps: 2000 },
};

/** Stored a couple of decay periods ago, healthy enough that no bonus fires. */
const storedPet = (overrides: Partial<PetState> = {}): PetState => ({
  ...createPet('user-1', 'Miso'),
  id: 'pet-1',
  energy: 80,
  nutrition: 80,
  happiness: 80,
  health: 90,
  lastEventAt: new Date(now - 2 * DECAY_PERIOD_MS).toISOString(),
  version: 3,
  ...overrides,
});

/**
 * Stands in for SupabaseRepository. `outcomes` is consumed one per save, so a
 * test can script "conflict, then saved" exactly; `fresh` is what a reload
 * returns after a conflict. `saveEvent` is here only to prove the commit loop
 * never touches it — that is the caller's job, after the pet write lands.
 */
const fakeRemote = (outcomes: PetSaveResult[], fresh: PetState | null) => {
  const saves: { pet: PetState; expectedVersion: number }[] = [];
  const loadPetById = jest.fn(async (_petId: string) => fresh);
  const saveEvent = jest.fn(async () => undefined);
  const savePetIfUnchanged = jest.fn(async (pet: PetState, expectedVersion: number) => {
    saves.push({ pet, expectedVersion });
    const next = outcomes.shift();
    if (!next) throw new Error('unscripted save');
    return next;
  });
  return { loadPetById, saveEvent, savePetIfUnchanged, saves };
};

describe('commitCareMoment', () => {
  it('saves once with no conflict, decaying from the stored anchor exactly once', async () => {
    const pet = storedPet();
    const remote = fakeRemote([{ status: 'saved', version: 4 }], null);

    const result = await commitCareMoment({ pet, event: walk, events: [], profile, engine, remote });

    expect(result.attempts).toBe(1);
    expect(remote.savePetIfUnchanged).toHaveBeenCalledTimes(1);
    expect(remote.loadPetById).not.toHaveBeenCalled();
    // Written against the version it was read at, and returned with the new one.
    expect(remote.saves[0].expectedVersion).toBe(3);
    expect(result.pet.version).toBe(4);
    // Decay settled from the STORED pet's anchor, then the walk's +3 on top —
    // a second decay pass would land lower than this.
    const decayed = applyTimeDecay(pet, new Date(walk.occurredAt));
    expect(decayed.energy).toBeLessThan(pet.energy);
    expect(remote.saves[0].pet.energy).toBe(decayed.energy + 3);
    expect(result.reaction.delta.energy).toBe(3);
  });

  it('reloads and re-plans from the fresh row after a conflict', async () => {
    const stale = storedPet({ energy: 80 });
    // The partner's write in between: a different anchor, different stats, a newer version.
    const fresh = storedPet({ energy: 40, lastEventAt: new Date(now).toISOString(), version: 7 });
    const remote = fakeRemote([{ status: 'conflict' }, { status: 'saved', version: 8 }], fresh);

    const stalePlan = planCareMoment({ pet: stale, event: walk, events: [], profile, engine });
    const result = await commitCareMoment({ pet: stale, event: walk, events: [], profile, engine, remote });

    expect(result.attempts).toBe(2);
    expect(remote.loadPetById).toHaveBeenCalledTimes(1);
    expect(remote.savePetIfUnchanged).toHaveBeenCalledTimes(2);
    // First attempt carried the stale plan and version; the second was built from the fresh row.
    expect(remote.saves[0].expectedVersion).toBe(3);
    expect(remote.saves[0].pet.energy).toBe(stalePlan.pet.energy);
    expect(remote.saves[1].expectedVersion).toBe(7);
    // No decay against the fresh anchor (it is "now"), so exactly 40 + 3.
    expect(remote.saves[1].pet.energy).toBe(43);
    expect(remote.saves[1].pet.energy).not.toBe(stalePlan.pet.energy);
    expect(remote.saves[1].pet.lastEventAt).toBe(walk.occurredAt);
    expect(result.pet.energy).toBe(43);
    expect(result.pet.version).toBe(8);
  });

  it('gives up after three conflicts with the try-again message and saves no event', async () => {
    const pet = storedPet();
    const fresh = storedPet({ version: 9 });
    const remote = fakeRemote(
      [{ status: 'conflict' }, { status: 'conflict' }, { status: 'conflict' }],
      fresh,
    );

    await expect(
      commitCareMoment({ pet, event: walk, events: [], profile, engine, remote }),
    ).rejects.toThrow(careConflictMessage('Miso'));

    expect(remote.savePetIfUnchanged).toHaveBeenCalledTimes(3);
    expect(remote.loadPetById).toHaveBeenCalledTimes(3);
    expect(remote.saveEvent).not.toHaveBeenCalled();
  });

  it('is a single pure pass with no remote, identical to planCareMoment', async () => {
    const pet = storedPet();
    const plan = planCareMoment({ pet, event: walk, events: [], profile, engine });

    const result = await commitCareMoment({ pet, event: walk, events: [], profile, engine });

    expect(result.attempts).toBe(1);
    expect(result.pet).toEqual(plan.pet);
    expect(result.reaction).toEqual(plan.reaction);
  });
});

describe('commitCareMomentForAll', () => {
  const both = () => [storedPet({ id: 'mine', name: 'Miso' }), storedPet({ id: 'ours', name: 'Blue' })];

  it('feeds every pet from a single logged moment', async () => {
    // One meal is a fact about the person, not about a pet — so both are fed and
    // the user is never asked which one the food was for.
    const remote = fakeRemote([{ status: 'saved', version: 4 }, { status: 'saved', version: 9 }], null);
    const pets = both();

    const outcome = await commitCareMomentForAll({
      pets, event: walk, events: [], profile, engine, remote,
    });

    expect(outcome.results).toHaveLength(2);
    expect(remote.saves.map((save) => save.pet.id)).toEqual(['mine', 'ours']);
    for (const pet of outcome.pets) expect(pet.energy).toBeGreaterThan(0);
  });

  it('reloads the pet that conflicted, not whichever one is "the" pet', async () => {
    const pets = both();
    const remote = fakeRemote(
      [{ status: 'saved', version: 4 }, { status: 'conflict' }, { status: 'saved', version: 10 }],
      storedPet({ id: 'ours', name: 'Blue', version: 9 }),
    );

    await commitCareMomentForAll({ pets, event: walk, events: [], profile, engine, remote });

    expect(remote.loadPetById).toHaveBeenCalledTimes(1);
    expect(remote.loadPetById).toHaveBeenCalledWith('ours');
  });

  it('still feeds the other pet when one of them fails', async () => {
    // No cross-pet transaction exists over PostgREST, and half a moment applied
    // beats a moment lost — so a failure must not abort the rest.
    const pets = both();
    const remote = fakeRemote([{ status: 'conflict' }, { status: 'saved', version: 9 }], null);

    const outcome = await commitCareMomentForAll({
      pets, event: walk, events: [], profile, engine, remote, maxAttempts: 1,
    });

    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].pet.id).toBe('ours');
    // The failed pet is still in the list, unchanged, so the caller's state stays complete.
    expect(outcome.pets.map((pet) => pet.id)).toEqual(['mine', 'ours']);
    expect(outcome.pets[0]).toEqual(pets[0]);
  });

  it('raises only when no pet could be fed at all', async () => {
    const pets = both();
    const remote = fakeRemote([{ status: 'conflict' }, { status: 'conflict' }], null);

    // Surfaces the first pet's failure, having tried both — the caller gets one
    // message rather than silence about a moment that went nowhere.
    await expect(
      commitCareMomentForAll({ pets, event: walk, events: [], profile, engine, remote, maxAttempts: 1 }),
    ).rejects.toThrow(/Miso/);
    expect(remote.saves.map((save) => save.pet.id)).toEqual(['mine', 'ours']);
  });

  it('works with one pet, which is what most accounts have', async () => {
    const remote = fakeRemote([{ status: 'saved', version: 4 }], null);
    const outcome = await commitCareMomentForAll({
      pets: [storedPet()], event: walk, events: [], profile, engine, remote,
    });
    expect(outcome.results).toHaveLength(1);
    expect(outcome.pets).toHaveLength(1);
  });
});
