import type { HealthEvent } from '../domain/health';
import type { PetState } from '../domain/pet';
import type { BodyProfile } from '../domain/macroTargets';
import { supabase } from './supabaseClient';

type PetRow = Omit<PetState, 'lastEventAt'> & { last_event_at: string | null };
type HealthEventRow = HealthEvent & { user_id: string; occurred_at: string };

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_* variables.');
  return supabase;
};

export class SupabaseRepository {
  async loadProfile(): Promise<BodyProfile | null> {
    const client = requireClient();
    const { data, error } = await client.from('profiles').select('age, sex, height_cm, weight_kg, activity, goal').single();
    if (error?.code === 'PGRST116') return null;
    if (error) throw error;
    if (!data.age || !data.sex || !data.height_cm || !data.weight_kg || !data.activity || !data.goal) return null;
    return { age: data.age, sex: data.sex, heightCm: data.height_cm, weightKg: data.weight_kg, activity: data.activity, goal: data.goal } as BodyProfile;
  }

  async saveProfile(profile: BodyProfile): Promise<void> {
    const client = requireClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Sign in before saving your profile.');
    const { error } = await client.from('profiles').update({ age: profile.age, sex: profile.sex, height_cm: profile.heightCm, weight_kg: profile.weightKg, activity: profile.activity, goal: profile.goal }).eq('id', user.id);
    if (error) throw error;
  }

  async loadPet(): Promise<PetState | null> {
    const client = requireClient();
    const { data, error } = await client.from('pets').select('*').single();
    if (error?.code === 'PGRST116') return null;
    if (error) throw error;
    const pet = data as PetRow;
    return { ...pet, lastEventAt: pet.last_event_at ?? undefined };
  }

  async savePet(pet: PetState): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('pets').upsert({
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
      endurance: pet.endurance,
      recovery: pet.recovery,
      mood: pet.mood,
      last_event_at: pet.lastEventAt ?? null,
    });
    if (error) throw error;
  }

  async loadEvents(): Promise<HealthEvent[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('health_events')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(20);
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