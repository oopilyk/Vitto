import AsyncStorage from '@react-native-async-storage/async-storage';
import {
 type WorkoutTemplate,  type CareLogEntry,
  type GeoPoint,
  type Reminder,
  type HealthEvent,
  type PetInvite,
  type PetMember,
  type PetSaveResult,
  type PetState,
  type WordPuzzleRoundOutcome,
} from '@vitto/core';

const petKey = 'vitto.pet';
const eventKey = 'vitto.events';
const wordPuzzleKey = 'vitto.wordpuzzle.progress';
/**
 * One coordinate, on this device only. The gym check compares live position
 * against this and stores nothing else — no fixes, no trail. Kept local rather
 * than in the profile row so "where you train" never leaves the phone.
 */
const gymKey = 'vitto.gym';
/**
 * The user's own reminders. Local rather than in the profile row: they schedule
 * OS notifications on this device, so a copy on another phone would either fire
 * nothing or fire twice. Losing them on reinstall is the accepted trade.
 */
const remindersKey = 'vitto.reminders';
const islandKey = 'vitto.island';
/**
 * Achievement ids already shown unlocking, keyed by account — see App's unlock
 * queue.
 *
 * Keyed, because this is device storage and a device can see more than one
 * account. Held as one flat list it belonged to nobody in particular: the app
 * seeded it from whatever was on screen at launch (signed out, that is nothing),
 * and signing in then announced the new account's ENTIRE history at once.
 */
const seenAchievementsKey = 'vitto.achievements.seen';
/** Saved workout routines ("Push", "Pull", "Legs") — personal setup, kept on-device like reminders. */
const workoutTemplatesKey = 'vitto.workout.templates';
const MAX_STORED_EVENTS = 2000;
const CARE_PARTNERS_OFFLINE_MESSAGE = 'Care partners need an online account.';

/**
 * A day's WordPuzzle in flight.
 *
 * Only the player's own guesses are kept -- never the answers. The board rebuilds
 * itself from the guesses alone, and a device backup or file dump of a half-finished
 * game must not hand over the words the player has not solved yet.
 */
export interface WordPuzzleProgress {
  puzzleDate: string;
  startedAt: string;
  /** The round to resume at; equals the round count once every round is played. */
  roundIndex: number;
  /** Guesses per round, in order. */
  guesses: string[][];
  /** One entry per completed round. */
  outcomes: WordPuzzleRoundOutcome[];
}

/**
 * AsyncStorage is promise-based, so every method here is async — the web version
 * could read localStorage synchronously during render, and callers had to change.
 */
export class LocalRepository {
  async loadPet(): Promise<PetState | null> {
    const value = await AsyncStorage.getItem(petKey);
    if (!value) return null;
    const pet = JSON.parse(value) as PetState;
    return {
      ...pet,
      pushingStrength: pet.pushingStrength ?? 10,
      pullingStrength: pet.pullingStrength ?? 10,
      legStrength: pet.legStrength ?? 10,
      mind: pet.mind ?? 20,
      adoptedAt: pet.adoptedAt ?? new Date().toISOString(),
    };
  }

  async savePet(pet: PetState): Promise<void> {
    await AsyncStorage.setItem(petKey, JSON.stringify(pet));
  }

  async loadEvents(): Promise<HealthEvent[]> {
    const value = await AsyncStorage.getItem(eventKey);
    return value ? (JSON.parse(value) as HealthEvent[]) : [];
  }

  async saveEvent(event: HealthEvent): Promise<void> {
    const events = await this.loadEvents();
    await AsyncStorage.setItem(
      eventKey,
      JSON.stringify([event, ...events].slice(0, MAX_STORED_EVENTS)),
    );
  }

  /** Replace an existing event in place (same id) — used to keep one step
   *  snapshot per day instead of appending on every re-sync. */
  async replaceEvent(event: HealthEvent): Promise<void> {
    const events = await this.loadEvents();
    await AsyncStorage.setItem(
      eventKey,
      JSON.stringify(
        [event, ...events.filter((existing) => existing.id !== event.id)].slice(0, MAX_STORED_EVENTS),
      ),
    );
  }

  async loadWordPuzzleProgress(): Promise<WordPuzzleProgress | null> {
    const value = await AsyncStorage.getItem(wordPuzzleKey);
    return value ? (JSON.parse(value) as WordPuzzleProgress) : null;
  }

  async saveWordPuzzleProgress(progress: WordPuzzleProgress): Promise<void> {
    await AsyncStorage.setItem(wordPuzzleKey, JSON.stringify(progress));
  }

  async clearWordPuzzleProgress(): Promise<void> {
    await AsyncStorage.removeItem(wordPuzzleKey);
  }

  async loadProfile<T>(): Promise<T | null> {
    const value = await AsyncStorage.getItem('vitto.profile');
    return value ? (JSON.parse(value) as T) : null;
  }

  async saveProfile(profile: unknown): Promise<void> {
    await AsyncStorage.setItem('vitto.profile', JSON.stringify(profile));
  }

  async clear(): Promise<void> {
    await AsyncStorage.multiRemove([petKey, eventKey, wordPuzzleKey, gymKey, remindersKey, seenAchievementsKey, workoutTemplatesKey, islandKey, 'vitto.profile']);
  }

  /** Whether the pet shows in the Dynamic Island. Null until chosen, which reads as on. */
  async loadIslandEnabled(): Promise<boolean | null> {
    const value = await AsyncStorage.getItem(islandKey);
    return value === null ? null : value === 'true';
  }

  async saveIslandEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(islandKey, String(enabled));
  }

  async loadReminders(): Promise<Reminder[]> {
    const value = await AsyncStorage.getItem(remindersKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as Reminder[]) : [];
  }

  async saveReminders(reminders: Reminder[]): Promise<void> {
    await AsyncStorage.setItem(remindersKey, JSON.stringify(reminders));
  }

  /**
   * `null` when nothing has ever been stored — distinct from an empty list. The
   * first launch on a device with history seeds this silently instead of
   * announcing a year of milestones at once; that decision needs to know the
   * difference between "seen nothing" and "never asked".
   */
  async loadSeenAchievements(scope: string): Promise<string[] | null> {
    const value = await AsyncStorage.getItem(seenAchievementsKey);
    if (value === null) return null;
    const parsed = JSON.parse(value) as unknown;
    // A bare array is the pre-scope format, written when this was one list for
    // the whole device. It belongs to whoever was signed in at the time, which
    // is not knowable, so it is treated as "never asked" for every scope: the
    // caller then seeds silently, which announces nothing it should not.
    if (Array.isArray(parsed)) return null;
    if (!parsed || typeof parsed !== 'object') return null;
    const stored = (parsed as Record<string, unknown>)[scope];
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : null;
  }

  async saveSeenAchievements(scope: string, ids: readonly string[]): Promise<void> {
    const value = await AsyncStorage.getItem(seenAchievementsKey);
    const parsed = value === null ? null : (JSON.parse(value) as unknown);
    const byScope =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, string[]>) }
        : {};
    byScope[scope] = [...ids];
    await AsyncStorage.setItem(seenAchievementsKey, JSON.stringify(byScope));
  }

  async loadWorkoutTemplates(): Promise<WorkoutTemplate[]> {
    const value = await AsyncStorage.getItem(workoutTemplatesKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkoutTemplate[]) : [];
  }

  async saveWorkoutTemplates(templates: readonly WorkoutTemplate[]): Promise<void> {
    await AsyncStorage.setItem(workoutTemplatesKey, JSON.stringify(templates));
  }

  async loadGymLocation(): Promise<GeoPoint | null> {
    const value = await AsyncStorage.getItem(gymKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<GeoPoint>;
    return typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number'
      ? { latitude: parsed.latitude, longitude: parsed.longitude }
      : null;
  }

  async saveGymLocation(point: GeoPoint): Promise<void> {
    await AsyncStorage.setItem(gymKey, JSON.stringify({ latitude: point.latitude, longitude: point.longitude }));
  }

  async clearGymLocation(): Promise<void> {
    await AsyncStorage.removeItem(gymKey);
  }

  // --- Care partners -------------------------------------------------------
  // Same method names as SupabaseRepository so the care-moment pipeline can be
  // handed either one. A single device has exactly one writer, so an optimistic
  // write can never conflict, and there is nobody to share the pet with: the
  // read-side methods answer "nobody" and the invite/leave actions refuse. The
  // UI never shows them in local mode (it is gated on `isSupabaseConfigured`).

  async savePetIfUnchanged(pet: PetState, expectedVersion: number): Promise<PetSaveResult> {
    void expectedVersion;
    await this.savePet(pet);
    return { status: 'saved', version: pet.version ?? 0 };
  }

  async loadPetMembers(petId: string): Promise<PetMember[]> {
    void petId;
    return [];
  }

  async loadCareLog(petId: string, limit?: number): Promise<CareLogEntry[]> {
    void petId;
    void limit;
    return [];
  }

  async appendCareLog(entry: Omit<CareLogEntry, 'id'>): Promise<void> {
    void entry;
  }

  async loadOpenInvite(petId: string): Promise<PetInvite | null> {
    void petId;
    return null;
  }

  async createInvite(petId: string): Promise<PetInvite> {
    void petId;
    throw new Error(CARE_PARTNERS_OFFLINE_MESSAGE);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    void inviteId;
    throw new Error(CARE_PARTNERS_OFFLINE_MESSAGE);
  }

  async deleteAccount(): Promise<void> {
    throw new Error('Deleting an account needs an online account.');
  }

  // Same shapes as the remote repository, so the two cannot drift apart.
  async redeemInvite(code: string): Promise<string> {
    void code;
    throw new Error(CARE_PARTNERS_OFFLINE_MESSAGE);
  }

  async leavePet(petId: string): Promise<void> {
    void petId;
    throw new Error(CARE_PARTNERS_OFFLINE_MESSAGE);
  }
}
