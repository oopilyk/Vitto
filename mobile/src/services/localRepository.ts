import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type CareLogEntry,
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
/** Achievement ids the user has already been shown unlocking — see App's unlock queue. */
const seenAchievementsKey = 'vitto.achievements.seen';
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
    await AsyncStorage.multiRemove([petKey, eventKey, wordPuzzleKey, gymKey, remindersKey, seenAchievementsKey, 'vitto.profile']);
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
  async loadSeenAchievements(): Promise<string[] | null> {
    const value = await AsyncStorage.getItem(seenAchievementsKey);
    if (value === null) return null;
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  }

  async saveSeenAchievements(ids: readonly string[]): Promise<void> {
    await AsyncStorage.setItem(seenAchievementsKey, JSON.stringify([...ids]));
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
