import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BodyProfile, PersonalityDials, PetBreed, PetPersonality } from '@vitto/core';

/**
 * Onboarding in progress, kept on the phone so closing the app part way
 * through does not start it over.
 *
 * The server cannot hold it: a profile row that has not been through
 * onboarding is dropped when it is loaded (so a new account never inherits a
 * previous one's answers), and the pet's name, look and character only reach
 * the server with the pet itself. So the whole draft lives here, per account,
 * until the pet is adopted and it is deleted.
 */

/** Where the screen itself had got to. Owned by OnboardingScreen; opaque here. */
export type OnboardingProgress = Record<string, unknown> & { stepId: string };

export interface OnboardingDraft {
  version: 1;
  progress: OnboardingProgress;
  name: string;
  breed: PetBreed;
  personality: PetPersonality;
  persona: string;
  dials?: PersonalityDials;
  profile: BodyProfile;
}

const keyFor = (userId: string) => `vitto.onboardingDraft.${userId}`;

export const loadOnboardingDraft = async (userId: string): Promise<OnboardingDraft | null> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<OnboardingDraft>;
    // Anything that is not a draft this version wrote is ignored, not trusted.
    if (draft.version !== 1 || !draft.progress || typeof draft.progress.stepId !== 'string' || !draft.profile) return null;
    return draft as OnboardingDraft;
  } catch {
    return null;
  }
};

export const saveOnboardingDraft = (userId: string, draft: OnboardingDraft): Promise<void> =>
  AsyncStorage.setItem(keyFor(userId), JSON.stringify(draft)).catch(() => undefined);

export const clearOnboardingDraft = (userId: string): Promise<void> =>
  AsyncStorage.removeItem(keyFor(userId)).catch(() => undefined);
