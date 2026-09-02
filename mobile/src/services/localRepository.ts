import AsyncStorage from '@react-native-async-storage/async-storage';
import { type HealthEvent, type WordPuzzleRoundOutcome, type PetState } from '@vitto/core';

const petKey = 'vitto.pet';
const eventKey = 'vitto.events';
const wordPuzzleKey = 'vitto.wordpuzzle.progress';
const MAX_STORED_EVENTS = 2000;

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
    await AsyncStorage.multiRemove([petKey, eventKey, wordPuzzleKey, 'vitto.profile']);
  }
}
