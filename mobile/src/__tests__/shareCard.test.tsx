import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { createPet, type HealthEvent } from '@vitto/core';
import { PetShareCard, shareCardLine } from '../components/PetShareCard';
import { shareCardFilename } from '../services/shareCard';

const NOW = new Date(2026, 8, 24, 14, 0);
const pet = { ...createPet('u', 'Blue', 'dog', 'bunny'), level: 23, adoptedAt: new Date(2026, 7, 30).toISOString() };
/** A fortnight of being looked after, so the bond is warm rather than sulking. */
const cared: HealthEvent[] = Array.from({ length: 14 }, (_, back) => ({
  id: `e${back}`,
  userId: 'u',
  type: 'MEAL',
  occurredAt: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - back, 9).toISOString(),
  metadata: {},
})) as HealthEvent[];

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((node: any) => [node.props.children].flat().filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join(''))
    .join(' | ');

describe('the shareable card', () => {
  it('puts the name, level and day on it', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<PetShareCard pet={pet} events={[]} now={NOW} />); });
    const shown = strings(tree);
    expect(shown).toContain('Blue');
    expect(shown).toContain('23');
    expect(shown).toContain('Day 26');
    expect(shown).toContain('VITTO');
    act(() => tree.unmount());
  });

  it('says the same thing the plaque would, in the voice of this pet', () => {
    // The card exists to be posted, so two temperaments must not produce the
    // same sentence — that is the whole reason anyone would send it.
    const menace = shareCardLine({ ...pet, personality: 'menace', mood: 'hungry', nutrition: 10 }, cared, NOW);
    const cute = shareCardLine({ ...pet, personality: 'cute', mood: 'hungry', nutrition: 10 }, cared, NOW);
    expect(menace).not.toBe(cute);
    expect(menace).toContain('hungry');
    // A healthy pet speaks in the same words the stats screen uses.
    expect(shareCardLine({ ...pet, personality: 'sweet', mood: 'bright' }, cared, NOW)).toContain('happy');
    // A pet that has been left alone does not perform its personality, the same
    // way the plaque goes plain. The card is honest, not a highlight reel.
    expect(shareCardLine({ ...pet, personality: 'menace', mood: 'hungry', nutrition: 10 }, [], NOW))
      .toBe("I'm so hungry. Feed me?");
  });

  it('only fires onReady once both images have painted', () => {
    let ready = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<PetShareCard pet={pet} events={[]} now={NOW} onReady={() => { ready += 1; }} />); });
    const images = tree.root.findAll((node: any) => typeof node.props.onLoad === 'function');
    expect(images.length).toBeGreaterThanOrEqual(2);
    act(() => images[0]!.props.onLoad());
    expect(ready).toBe(0);           // a capture here would be half-blank
    act(() => images[1]!.props.onLoad());
    expect(ready).toBe(1);
    act(() => tree.unmount());
  });

  it('names the file after the pet', () => {
    expect(shareCardFilename('Blue')).toBe('blue-vitto.png');
    expect(shareCardFilename('Mr. Wiggles!')).toBe('mr-wiggles-vitto.png');
    expect(shareCardFilename('  ')).toBe('pet-vitto.png');
  });
});
