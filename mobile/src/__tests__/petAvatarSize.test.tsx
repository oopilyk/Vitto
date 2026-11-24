import renderer, { act } from 'react-test-renderer';
import { createPet } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { SpriteFrame } from '../components/SpriteFrame';

const pet = createPet('user-1', 'Miso');

const baseProps = {
  pet,
  isAnalyzingMeal: false,
  isEating: false,
  feedingImage: null,
  feedingGrade: null,
  isCelebrating: false,
  isWorkingOut: false,
  isExploring: false,
};

/**
 * `EnvironmentStage` passes a larger `size` so the pet reads as the main
 * object of its full-bleed scene, but every other caller (breed pickers,
 * `FriendPetCard`, older dashboard paths) relies on the original 148px art —
 * this guards against that default silently drifting.
 */
describe('PetAvatar size override', () => {
  it('defaults to the original 148px sprite size when no override is passed', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PetAvatar {...baseProps} />);
    });
    expect(tree.root.findByType(SpriteFrame).props.size).toBe(148);
    tree.unmount();
  });

  it('renders at the overridden size when one is passed, without changing default callers', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PetAvatar {...baseProps} size={216} />);
    });
    expect(tree.root.findByType(SpriteFrame).props.size).toBe(216);
    tree.unmount();
  });
});

describe('PetAvatar when tired', () => {
  // The tabby has no sleep art: its `rest` is one still frame, and a tired
  // tabby used to stand frozen on it.
  it('keeps a pet with no sleep art moving, its idle played slowly', () => {
    jest.useFakeTimers();
    const tired = { ...pet, breed: 'tabbyCat' as const, mood: 'sleepy' as const, energy: 30 };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PetAvatar {...baseProps} pet={tired} />);
    });
    const seen = new Set<string>();
    for (let tick = 0; tick < 75; tick += 1) {
      seen.add(String(tree.root.findByType(SpriteFrame).props.frame));
      act(() => jest.advanceTimersByTime(200));
    }
    expect(seen.size).toBeGreaterThan(1);
    tree.unmount();
    jest.useRealTimers();
  });
});
