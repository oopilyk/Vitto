import type { HealthEvent } from '../domain/health';
import type { PetState } from '../domain/pet';

const petKey = 'vitto.pet';
const eventKey = 'vitto.events';
const legacyPetKey = 'nuri.pet';
const legacyEventKey = 'nuri.events';

export class LocalRepository {
  loadPet(): PetState | null {
    const value = localStorage.getItem(petKey) ?? localStorage.getItem(legacyPetKey);
    if (!value) return null;
    const pet = JSON.parse(value) as PetState;
    return { ...pet, pushingStrength: pet.pushingStrength ?? 10, pullingStrength: pet.pullingStrength ?? 10, legStrength: pet.legStrength ?? 10 };
  }

  savePet(pet: PetState) {
    localStorage.setItem(petKey, JSON.stringify(pet));
  }

  loadEvents(): HealthEvent[] {
    const value = localStorage.getItem(eventKey) ?? localStorage.getItem(legacyEventKey);
    return value ? JSON.parse(value) as HealthEvent[] : [];
  }

  saveEvent(event: HealthEvent) {
    localStorage.setItem(eventKey, JSON.stringify([event, ...this.loadEvents()].slice(0, 20)));
  }
}
