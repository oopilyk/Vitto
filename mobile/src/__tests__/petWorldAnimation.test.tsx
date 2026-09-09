import { assessCondition, createPet, type PetCondition } from '@vitto/core';
import { animationFor, type PetActivity } from '../components/PetAvatar';
import { animationForInteraction } from '../petWorld/interactionAnimation';
import { IDLE_ACTIVITY, toPetAvatarActivityProps } from '../petWorld/toPetAvatarActivityProps';
import type { PetInteractionState } from '../petWorld/types';

const pet = createPet('user-1', 'Miso');
const well: PetCondition = assessCondition(pet);

describe('toPetAvatarActivityProps', () => {
  it('maps idle, noticing, walking-to-food and sleeping all to the same idle activity', () => {
    // None of these has a boolean of its own on `PetAvatar` — see the ART GAP
    // note on `toPetAvatarActivityProps`.
    const noBooleanOfTheirOwn: PetInteractionState[] = [
      { kind: 'idle' },
      { kind: 'noticing' },
      { kind: 'walkingToFood', grade: 'A' },
      { kind: 'sleeping' },
    ];
    for (const state of noBooleanOfTheirOwn) {
      expect(toPetAvatarActivityProps(state)).toEqual(IDLE_ACTIVITY);
    }
  });

  it('flips only isAnalyzingMeal while analyzing', () => {
    expect(toPetAvatarActivityProps({ kind: 'analyzing' })).toEqual({
      ...IDLE_ACTIVITY,
      isAnalyzingMeal: true,
    });
  });

  it('carries the plate image and grade through while eating', () => {
    expect(
      toPetAvatarActivityProps({ kind: 'eating', feedingImage: 'file:///plate.jpg', grade: 'B' }),
    ).toEqual({
      ...IDLE_ACTIVITY,
      isEating: true,
      feedingImage: 'file:///plate.jpg',
      feedingGrade: 'B',
    });
  });

  it('clears the plate image but keeps the grade once eating finishes and the plate is gone', () => {
    expect(toPetAvatarActivityProps({ kind: 'eating', feedingImage: null, grade: 'A' })).toEqual({
      ...IDLE_ACTIVITY,
      isEating: true,
      feedingImage: null,
      feedingGrade: 'A',
    });
  });

  it('carries the grade into celebrating without a plate image, for the heart-stream overlay', () => {
    expect(toPetAvatarActivityProps({ kind: 'celebrating', grade: 'A' })).toEqual({
      ...IDLE_ACTIVITY,
      isCelebrating: true,
      feedingGrade: 'A',
    });
  });

  it('flips only isWorkingOut / isExploring for those states', () => {
    expect(toPetAvatarActivityProps({ kind: 'workingOut' })).toEqual({
      ...IDLE_ACTIVITY,
      isWorkingOut: true,
    });
    expect(toPetAvatarActivityProps({ kind: 'exploring' })).toEqual({
      ...IDLE_ACTIVITY,
      isExploring: true,
    });
  });

  it('folds the live ambient-walking cue into isExploring, same as a tap-triggered explore', () => {
    expect(toPetAvatarActivityProps({ kind: 'ambientWalking' })).toEqual({
      ...IDLE_ACTIVITY,
      isExploring: true,
    });
  });
});

describe('animationForInteraction', () => {
  it('picks the band that matches what the pet is doing, same as PetAvatar.animationFor', () => {
    expect(animationForInteraction({ kind: 'celebrating', grade: 'A' }, 'content', well)).toBe('cheer');
    expect(animationForInteraction({ kind: 'exploring' }, 'content', well)).toBe('move');
    expect(animationForInteraction({ kind: 'idle' }, 'sleepy', well)).toBe('rest');
    expect(animationForInteraction({ kind: 'idle' }, 'hungry', well)).toBe('idle');
  });

  it('reuses the "move" band for walking to food -- there is no dedicated pose', () => {
    expect(animationForInteraction({ kind: 'walkingToFood', grade: 'A' }, 'content', well)).toBe('move');
  });

  it('reuses the "move" band for the live ambient-walking cue too', () => {
    expect(animationForInteraction({ kind: 'ambientWalking' }, 'content', well)).toBe('move');
  });

  it('reads sleeping the same as PetAvatar reads a sleepy idle pet', () => {
    expect(animationForInteraction({ kind: 'sleeping' }, 'content', well)).toBe('rest');
  });

  it('lets what the pet is doing outrank what is wrong with it, same set as PetAvatar', () => {
    const starving = assessCondition({ ...pet, nutrition: 4 });
    expect(starving.primary).toBe('starving');

    expect(
      animationForInteraction({ kind: 'eating', feedingImage: null, grade: 'A' }, 'hungry', starving),
    ).toBe('cheer');
    expect(animationForInteraction({ kind: 'workingOut' }, 'hungry', starving)).toBe('move');
    expect(animationForInteraction({ kind: 'walkingToFood', grade: 'A' }, 'hungry', starving)).toBe(
      'move',
    );
    // Idle, the ailment takes the sprite back over -- same as PetAvatar.
    expect(animationForInteraction({ kind: 'idle' }, 'hungry', starving)).toBe('sad');
  });

  it('leaves analyzing and noticing under the ailment, same as PetAvatar leaves analyzing', () => {
    const foggy = assessCondition({ ...pet, mind: 3 });
    expect(foggy.primary).toBe('foggy');

    expect(animationForInteraction({ kind: 'analyzing' }, 'content', foggy)).toBe('unwell');
    expect(animationForInteraction({ kind: 'noticing' }, 'content', foggy)).toBe('unwell');
  });

  it('agrees with PetAvatar.animationFor on every ailment pose', () => {
    // Cross-checks the duplicated ANIMATION_BY_AILMENT table against
    // PetAvatar.tsx's own -- see the note on `interactionAnimation.ts` for
    // why there are two.
    const ailmentOverrides: Record<string, Partial<typeof pet>> = {
      dying: { health: 5, nutrition: 4, energy: 8, happiness: 12, mind: 3 },
      starving: { nutrition: 4 },
      exhausted: { energy: 8 },
      sad: { happiness: 12 },
      foggy: { mind: 3 },
    };

    for (const [ailment, overrides] of Object.entries(ailmentOverrides)) {
      const condition = assessCondition({ ...pet, ...overrides });
      expect(condition.primary).toBe(ailment);

      const legacy: PetActivity = 'idle';
      expect(animationForInteraction({ kind: 'idle' }, 'content', condition)).toBe(
        animationFor(legacy, 'content', condition),
      );
    }
  });
});
