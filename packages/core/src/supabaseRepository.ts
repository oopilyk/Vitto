import type { HealthEvent } from './domain/health';
import type { PetState } from './domain/pet';
import { withSurveyDefaults, type BodyProfile } from './domain/macroTargets';
import { requireSupabase } from './config';

type PetRow = Omit<PetState, 'userId' | 'lastEventAt' | 'pushingStrength' | 'pullingStrength' | 'legStrength' | 'mind' | 'adoptedAt'> & { user_id: string; last_event_at: string | null; pushing_strength: number; pulling_strength: number; leg_strength: number; mind: number | null; adopted_at: string | null; created_at: string | null };
type HealthEventRow = HealthEvent & { user_id: string; occurred_at: string };

// Every numeric column on `pets` is an integer in Postgres, and decayed stats can
// still arrive fractional from older locally stored pets.
const wholeNumbers = <T extends Record<string, unknown>>(row: T): T =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value) : value]),
  ) as T;

/**
 * PostgREST reports an unknown column as PGRST204 on writes and Postgres as 42703
 * on reads; both name the column. Pulling that name out lets a save recover from a
 * database that has not run the latest migration yet, one column at a time.
 */
const missingColumn = (error: { code?: string; message?: string } | null): string | null => {
  if (!error?.message) return null;
  if (error.code !== 'PGRST204' && error.code !== '42703') return null;
  const quoted = error.message.match(/'([a-z_]+)' column/);
  const named = error.message.match(/column (?:[a-z_]+\.)?([a-z_]+) does not exist/);
  return quoted?.[1] ?? named?.[1] ?? null;
};

type WriteResult = { error: { code?: string; message?: string } | null };

/**
 * Writes a row, dropping any column the database does not have yet and retrying,
 * so a pending migration degrades to a partial save instead of losing the write.
 */
const saveDroppingMissingColumns = async (
  payload: Record<string, unknown>,
  write: (row: Record<string, unknown>) => PromiseLike<WriteResult>,
): Promise<void> => {
  let row = payload;
  for (let attempt = 0; attempt <= Object.keys(payload).length; attempt += 1) {
    const { error } = await write(row);
    if (!error) return;
    const column = missingColumn(error);
    if (!column || !(column in row)) throw error;
    const { [column]: _absent, ...remaining } = row;
    row = remaining;
  }
};

/**
 * When a pet was really adopted.
 *
 * `adopted_at` was added by a later migration as `not null default now()`, so
 * every pet that already existed carries the moment that migration ran instead
 * of its adoption date. That made the dashboard restart "Day N with <pet>"
 * while the care streak -- derived from the events themselves -- kept counting,
 * so a pet could show a streak longer than it had existed.
 *
 * A pet cannot have been adopted after the row describing it was written, so the
 * row's own `created_at` is the floor. Taking the earlier of the two repairs the
 * read even on a database where the backfill migration has not run yet.
 */
const resolveAdoptedAt = (adoptedAt: string | null, createdAt: string | null): string => {
  const parsed = [adoptedAt, createdAt]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((candidate) => Number.isFinite(candidate.time));
  if (parsed.length === 0) return new Date().toISOString();
  return parsed.reduce((earliest, candidate) =>
    candidate.time < earliest.time ? candidate : earliest,
  ).value;
};

const requireClient = requireSupabase;

export class SupabaseRepository {
  async loadProfile(): Promise<BodyProfile | null> {
    const client = requireClient();
    const { data, error } = await client.from('profiles').select('*').maybeSingle();
    if (error?.code === 'PGRST116') return null;
    if (error) throw error;
    if (!data?.age || !data.sex || !data.height_cm || !data.weight_kg || !data.activity || !data.goal) {
      return null;
    }

    return withSurveyDefaults({
      age: data.age,
      sex: data.sex,
      heightCm: data.height_cm,
      heightUnit: data.height_unit === 'ft' ? 'ft' : 'cm',
      weightKg: data.weight_kg,
      weightUnit: data.weight_unit === 'lb' ? 'lb' : 'kg',
      activity: data.activity,
      goal: data.goal,
      targetWeightKg: data.target_weight_kg ?? undefined,
      goalWeeks: data.goal_weeks ?? undefined,
      goalPace: data.goal_pace ?? undefined,
      trainingDaysPerWeek: data.training_days_per_week ?? undefined,
      trainingStyle: data.training_style ?? undefined,
      focusAreas: Array.isArray(data.focus_areas) ? data.focus_areas : undefined,
    });
  }

  async saveProfile(profile: BodyProfile): Promise<void> {
    const client = requireClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Sign in before saving your profile.');

    const payload = {
      age: profile.age,
      sex: profile.sex,
      height_cm: profile.heightCm,
      height_unit: profile.heightUnit,
      weight_kg: profile.weightKg,
      weight_unit: profile.weightUnit,
      activity: profile.activity,
      goal: profile.goal,
      target_weight_kg: profile.targetWeightKg ?? null,
      goal_weeks: profile.goalWeeks ?? null,
      goal_pace: profile.goalPace,
      training_days_per_week: profile.trainingDaysPerWeek,
      training_style: profile.trainingStyle,
      focus_areas: profile.focusAreas,
    };

    await saveDroppingMissingColumns(payload, (row) =>
      client.from('profiles').update(row).eq('id', user.id),
    );
  }

  async loadPet(): Promise<PetState | null> {
    const client = requireClient();
    const { data, error } = await client.from('pets').select('*').single();
    if (error?.code === 'PGRST116') return null;
    if (error) throw error;
    const pet = data as PetRow;
    return { ...pet, userId: pet.user_id, lastEventAt: pet.last_event_at ?? undefined, pushingStrength: pet.pushing_strength, pullingStrength: pet.pulling_strength, legStrength: pet.leg_strength, mind: pet.mind ?? 20, breed: pet.breed ?? undefined, adoptedAt: resolveAdoptedAt(pet.adopted_at, pet.created_at) };
  }

  async savePet(pet: PetState): Promise<void> {
    const client = requireClient();
    const payload = wholeNumbers({
      id: pet.id,
      user_id: pet.userId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed ?? null,
      level: pet.level,
      xp: pet.xp,
      health: pet.health,
      energy: pet.energy,
      happiness: pet.happiness,
      nutrition: pet.nutrition,
      strength: pet.strength,
      pushing_strength: pet.pushingStrength,
      pulling_strength: pet.pullingStrength,
      leg_strength: pet.legStrength,
      endurance: pet.endurance,
      recovery: pet.recovery,
      mind: pet.mind,
      mood: pet.mood,
      adopted_at: pet.adoptedAt,
      last_event_at: pet.lastEventAt ?? null,
    });

    await saveDroppingMissingColumns(payload, (row) => client.from('pets').upsert(row));
  }

  async loadEvents(): Promise<HealthEvent[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('health_events')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data as HealthEventRow[]).map(({ user_id: _userId, occurred_at: occurredAt, ...event }) => ({
      ...event,
      occurredAt,
    }));
  }

  async saveEvent(event: HealthEvent): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('health_events').insert({
      id: event.id,
      user_id: event.userId,
      occurred_at: event.occurredAt,
      type: event.type,
      source: event.source,
      metadata: event.metadata,
    });
    if (error) throw error;
  }
}