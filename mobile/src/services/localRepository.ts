import AsyncStorage from '@react-native-async-storage/async-storage';
import { type HealthEvent, type PetState } from '@vitto/core';

const petKey = 'vitto.pet';
const eventKey = 'vitto.events';
const MAX_STORED_EVENTS = 2000;

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

  async loadProfile<T>(): Promise<T | null> {
    const value = await AsyncStorage.getItem('vitto.profile');
    return value ? (JSON.parse(value) as T) : null;
  }

  async saveProfile(profile: unknown): Promise<void> {
    await AsyncStorage.setItem('vitto.profile', JSON.stringify(profile));
  }

  async clear(): Promise<void> {
    await AsyncStorage.multiRemove([petKey, eventKey, 'vitto.profile']);
  }
}
