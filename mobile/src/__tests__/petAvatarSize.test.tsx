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
