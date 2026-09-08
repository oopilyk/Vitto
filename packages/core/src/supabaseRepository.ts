import type { HealthEvent } from './domain/health';
import type { PetState } from './domain/pet';
import { withSurveyDefaults, type BodyProfile } from './domain/macroTargets';
import {
  generateInviteCode,
  inviteExpiresAt,
  normalizeInviteCode,
  type CareLogEntry,
  type PetInvite,
  type PetMember,
  type PetSaveResult,
} from './domain/carePartners';
import { requireSupabase } from './config';

type PetRow = Omit<PetState, 'userId' | 'lastEventAt' | 'pushingStrength' | 'pullingStrength' | 'legStrength' | 'mind' | 'adoptedAt'> & { user_id: string; last_event_at: string | null; pushing_strength: number; pulling_strength: number; leg_strength: number; mind: number | null; adopted_at: string | null; created_at: string | null };
type HealthEventRow = HealthEvent & { user_id: string; occurred_at: string };
type PetMemberRow = { user_id: string; role: PetMember['role']; joined_at: string; left_at: string | null; display_name: string | null };
type PetInviteRow = { id: string; pet_id: string; code: string; created_at: string; expires_at: string; redeemed_at: string | null; revoked_at: string | null };
type CareLogRow = { id: string; pet_id: string; user_id: string; type: CareLogEntry['type']; occurred_at: string };

const CARE_LOG_DEFAULT_LIMIT = 50;

const toPetMember = (row: PetMemberRow): PetMember => ({
  userId: row.user_id,
  role: row.role,
  joinedAt: row.joined_at,
  leftAt: row.left_at ?? undefined,
  displayName: row.display_name ?? null,
});

const toPetInvite = (row: PetInviteRow): PetInvite => ({
  id: row.id,
  petId: row.pet_id,
  code: row.code,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  redeemedAt: row.redeemed_at ?? undefined,
  revokedAt: row.revoked_at ?? undefined,
});

const toCareLogEntry = (row: CareLogRow): CareLogEntry => ({
  id: row.id,
  petId: row.pet_id,
  userId: row.user_id,
  type: row.type,
  occurredAt: row.occurred_at,
});

/**
 * `handle_new_user` seeds `profiles.display_name` from the sign-up email, so a
 * stored name is only a name when it is non-blank and not email-shaped. Mirrors
 * the filter `get_pet_members` applies before showing it to a partner.
 */
const usableDisplayName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && !trimmed.includes('@') ? trimmed : undefined;
};

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

/** The `pets` row as the app writes it. No `version`: clients never send one. */
const petPayload = (pet: PetState) =>
  wholeNumbers({
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
      screenTimeBudgetMinutes: data.screen_time_budget_minutes ?? undefined,
      displayName: usableDisplayName(data.display_name),
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
      // Dropped and retried by saveDroppingMissingColumns on a database that
      // has not run the screen-time migration yet, so the rest still saves.
      // `||` not `??`: zero means "no budget" everywhere else (engine, mapping),
      // and the column's CHECK (1..1440) would reject it and sink the whole save.
      screen_time_budget_minutes: profile.screenTimeBudgetMinutes || null,
      // Blank means "no name" (the partner then sees a fallback), never ''.
      display_name: profile.displayName?.trim() || null,
    };

    await saveDroppingMissingColumns(payload, (row) =>
      client.from('profiles').update(row).eq('id', user.id),
    );
  }

  private static toPetState(row: PetRow): PetState {
    return { ...row, userId: row.user_id, lastEventAt: row.last_event_at ?? undefined, pushingStrength: row.pushing_strength, pullingStrength: row.pulling_strength, legStrength: row.leg_strength, mind: row.mind ?? 20, breed: row.breed ?? undefined, adoptedAt: resolveAdoptedAt(row.adopted_at, row.created_at), version: row.version ?? 0 };
  }

  /**
   * Every pet the signed-in user is an active member of — their own, and one
   * shared with a partner. RLS does the filtering, so this is a plain select.
   *
   * Ordered oldest first so the list is stable across loads: the UI keeps an
   * active pet by id, but anything falling back to "the first one" should not
   * get a different answer each time.
   */
  async loadPets(): Promise<PetState[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('pets')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as PetRow[]).map((row) => SupabaseRepository.toPetState(row));
  }

  /** One pet by id, for reloading the right row after a version conflict. */
  async loadPetById(petId: string): Promise<PetState | null> {
    const client = requireClient();
    const { data, error } = await client.from('pets').select('*').eq('id', petId).maybeSingle();
    if (error) throw error;
    return data ? SupabaseRepository.toPetState(data as PetRow) : null;
  }

  /**
   * The user's primary pet, kept for the single-pet callers (adoption, web).
   *
   * Deliberately NOT `.single()` any more: two pets made that fail with PGRST116,
   * which this class maps to "no pet at all" — so a user with a partner's pet as
   * well as their own would have been sent back through onboarding.
   */
  async loadPet(): Promise<PetState | null> {
    const pets = await this.loadPets();
    return pets[0] ?? null;
  }

  /**
   * Whole-row upsert. After the care-partners migration only the creator may
   * insert, so this is the adoption (and web) path; every later mobile write
   * goes through {@link savePetIfUnchanged}. `version` is never sent: the
   * database bumps it.
   */
  async savePet(pet: PetState): Promise<void> {
    const client = requireClient();
    await saveDroppingMissingColumns(petPayload(pet), (row) => client.from('pets').upsert(row));
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

  /**
   * Bulk insert, for the dev seeder. Chunked because a single statement with a
   * few hundred rows is the kind of thing PostgREST rejects on payload size, and
   * a partial failure here is recoverable — seeded data is disposable.
   */
  async saveEvents(events: HealthEvent[]): Promise<void> {
    const client = requireClient();
    const CHUNK = 200;
    for (let index = 0; index < events.length; index += CHUNK) {
      const rows = events.slice(index, index + CHUNK).map((event) => ({
        id: event.id,
        user_id: event.userId,
        occurred_at: event.occurredAt,
        type: event.type,
        source: event.source,
        metadata: event.metadata,
      }));
      // eslint-disable-next-line no-await-in-loop
      const { error } = await client.from('health_events').insert(rows);
      if (error) throw error;
    }
  }

  /**
   * Removes every event from one source for the signed-in user. Used to sweep
   * seeded data back out; RLS scopes the delete to the caller's own rows, so this
   * cannot reach anyone else's history.
   */
  async deleteEventsBySource(source: HealthEvent['source']): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('health_events').delete().eq('source', source);
    if (error) throw error;
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

  // --- Care partners -------------------------------------------------------

  /**
   * Optimistic write: updates the row only if its `version` still equals
   * `expectedVersion`. `conflict` means reload, recompute, retry — never resend.
   *
   * On a database that has not run the care-partners migration there is no
   * `version` column to check, so the write degrades to the plain upsert: a
   * single writer cannot conflict there.
   */
  async savePetIfUnchanged(pet: PetState, expectedVersion: number): Promise<PetSaveResult> {
    const client = requireClient();
    const { id: _id, user_id: _userId, ...payload } = petPayload(pet);
    const { data, error } = await client
      .from('pets')
      .update(payload)
      .eq('id', pet.id)
      .eq('version', expectedVersion)
      .select('version')
      .maybeSingle();
    if (error) {
      if (missingColumn(error) === 'version') {
        await this.savePet(pet);
        return { status: 'saved', version: expectedVersion };
      }
      throw error;
    }
    if (!data) return { status: 'conflict' };
    return { status: 'saved', version: (data as { version: number }).version };
  }

  /** All members, including ones who left, via `get_pet_members` (names already sanitised). */
  async loadPetMembers(petId: string): Promise<PetMember[]> {
    const client = requireClient();
    const { data, error } = await client.rpc('get_pet_members', { p_pet_id: petId });
    if (error) throw error;
    return ((data ?? []) as PetMemberRow[]).map(toPetMember);
  }

  /** Newest first; default limit 50. */
  async loadCareLog(petId: string, limit: number = CARE_LOG_DEFAULT_LIMIT): Promise<CareLogEntry[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('pet_care_log')
      .select('*')
      .eq('pet_id', petId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as CareLogRow[]).map(toCareLogEntry);
  }

  /** Best effort: callers must not let a failure here block the care moment. */
  async appendCareLog(entry: Omit<CareLogEntry, 'id'>): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('pet_care_log').insert({
      pet_id: entry.petId,
      user_id: entry.userId,
      type: entry.type,
      occurred_at: entry.occurredAt,
    });
    if (error) throw error;
  }

  /** The newest invite that is unredeemed, unrevoked and unexpired, or null. */
  async loadOpenInvite(petId: string): Promise<PetInvite | null> {
    const client = requireClient();
    const { data, error } = await client
      .from('pet_invites')
      .select('*')
      .eq('pet_id', petId)
      .is('redeemed_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toPetInvite(data as PetInviteRow) : null;
  }

  /**
   * Revokes any open invite for the pet first, so exactly one code is ever live.
   * The code column is globally unique; a collision (23505) is retried once
   * with a fresh code, which at 32^6 codes is already more than enough.
   */
  async createInvite(petId: string): Promise<PetInvite> {
    const client = requireClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Sign in before inviting a care partner.');

    const now = new Date();
    const { error: revokeError } = await client
      .from('pet_invites')
      .update({ revoked_at: now.toISOString() })
      .eq('pet_id', petId)
      .is('redeemed_at', null)
      .is('revoked_at', null);
    if (revokeError) throw revokeError;

    for (let attempt = 0; ; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await client
        .from('pet_invites')
        .insert({ pet_id: petId, created_by: user.id, code: generateInviteCode(), expires_at: inviteExpiresAt(now) })
        .select()
        .single();
      if (!error && data) return toPetInvite(data as PetInviteRow);
      if (error?.code === '23505' && attempt === 0) continue;
      throw error ?? new Error('Could not create an invite.');
    }
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('pet_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId);
    if (error) throw error;
  }

  /** Returns the joined pet's id. `confirmLeave` is required when the caller already has a pet. */
  async redeemInvite(code: string, options?: { confirmLeave?: boolean }): Promise<string> {
    const client = requireClient();
    const { data, error } = await client.rpc('redeem_pet_invite', {
      p_code: normalizeInviteCode(code),
      p_confirm_leave: options?.confirmLeave ?? false,
    });
    if (error) throw error;
    return data as string;
  }

  async leavePet(): Promise<void> {
    const client = requireClient();
    const { error } = await client.rpc('leave_pet');
    if (error) throw error;
  }
}