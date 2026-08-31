import type { HealthEvent } from '../domain/health';
import type { PetState } from '../domain/pet';
import type { BodyProfile } from '../domain/macroTargets';
import { supabase } from './supabaseClient';

type PetRow = Omit<PetState, 'userId' | 'lastEventAt' | 'pushingStrength' | 'pullingStrength' | 'legStrength' | 'adoptedAt'> & { user_id: string; last_event_at: string | null; pushing_strength: number; pulling_strength: number; leg_strength: number; adopted_at: string | null };
type HealthEventRow = HealthEvent & { user_id: string; occurred_at: string };

// Every numeric column on `pets` is an integer in Postgres, and decayed stats can
// still arrive fractional from older locally stored pets.
const wholeNumbers = <T extends Record<string, unknown>>(row: T): T =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value) : value]),
  ) as T;

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_* variables.');
  return supabase;
};

export class SupabaseRepository {
  async loadProfile(): Promise<BodyProfile | null> {
    const client = requireClient();
    const primary = await client
      .from('profiles')
      .select('age, sex, height_cm, height_unit, weight_kg, weight_unit, activity, goal')
      .maybeSingle();

    const missingHeightUnit =
      primary.error &&
      (primary.error.code === '42703' ||
        /height_unit/i.test(primary.error.message));

    const { data, error } = missingHeightUnit
      ? await client
          .from('profiles')
          .select('age, sex, height_cm, weight_kg, weight_unit, activity, goal')
          .maybeSingle()
      : primary;

    if (error?.code === 'PGRST116') return null;
    if (error) throw error;
    if (!data?.age || !data.sex || !data.height_cm || !data.weight_kg || !data.activity || !data.goal) {
      return null;
    }

    const heightUnit =
      'height_unit' in data && data.height_unit === 'ft' ? 'ft' : 'cm';

    return {
      age: data.age,
      sex: data.sex,
      heightCm: data.height_cm,
      heightUnit,
      weightKg: data.weight_kg,
      weightUnit: data.weight_unit === 'lb' ? 'lb' : 'kg',
      activity: data.activity,
      goal: data.goal,
    } as BodyProfile;
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
    };

    const { error } = await client.from('profiles').update(payload).eq('id', user.id);
    if (error && (error.code === '42703' || /height_unit/i.test(error.message))) {
      const { height_unit: _heightUnit, ...legacyPayload } = payload;
      const retry = await client.from('profiles').update(legacyPayload).eq('id', user.id);
      if (retry.error) throw retry.error;
      return;
    }
    if (error) throw error;
  }

  async loadPet(): Promise<PetState | null> {
    const client = requireClient();
    const { data, error } = await client.from('pets').select('*').single();
    if (error?.code === 'PGRST116') return null;
    if (error) throw error;
    const pet = data as PetRow;
    return { ...pet, userId: pet.user_id, lastEventAt: pet.last_event_at ?? undefined, pushingStrength: pet.pushing_strength, pullingStrength: pet.pulling_strength, legStrength: pet.leg_strength, adoptedAt: pet.adopted_at ?? new Date().toISOString() };
  }

  async savePet(pet: PetState): Promise<void> {
    const client = requireClient();
    const payload = wholeNumbers({
      id: pet.id,
      user_id: pet.userId,
      name: pet.name,
      species: pet.species,
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
      mood: pet.mood,
      adopted_at: pet.adoptedAt,
      last_event_at: pet.lastEventAt ?? null,
    });

    const { error } = await client.from('pets').upsert(payload);
    if (error && (error.code === '42703' || /adopted_at/i.test(error.message))) {
      const { adopted_at: _adoptedAt, ...legacyPayload } = payload;
      const retry = await client.from('pets').upsert(legacyPayload);
      if (retry.error) throw retry.error;
      return;
    }
    if (error) throw error;
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