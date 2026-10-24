import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../services/companionService', () => ({
  companionService: { memories: jest.fn(), forgetMemory: jest.fn(), forgetAllMemories: jest.fn() },
}));

const { companionService } = require('../services/companionService');
const { CompanionMemoriesScreen } = require('../screens/CompanionMemoriesScreen');

const memory = (id: string, content: string, category = 'preference') => ({
  id, category, content, importance: 0.7, confidence: 0.9, createdAt: 0, lastReferencedAt: 0, referenceCount: 0,
  expiresAt: null, eventDate: null, followedUpAt: null, source: 'extraction', active: true,
});

const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((t: any) => String(t.props.children));
const pressable = (tree: renderer.ReactTestRenderer, match: (props: any) => boolean) =>
  tree.root.findAll((n: any) => match(n.props) && typeof n.props.onPress === 'function')[0];
const button = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n: any) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t: any) => t.props.children === label))[0];

/** Lets the mocked service's promises settle. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const mount = async (confirm: jest.Mock = jest.fn().mockResolvedValue(true)) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CompanionMemoriesScreen petId="pet-1" petName="Blue" confirm={confirm} onClose={() => {}} />);
  });
  await settle();
  return tree;
};

describe('what the pet remembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the memories for this pet, in plain words', async () => {
    companionService.memories.mockResolvedValue([memory('m1', 'Loves spicy ramen'), memory('m2', 'Running a 10k in May', 'goal')]);
    const tree = await mount();
    expect(companionService.memories).toHaveBeenCalledWith('pet-1');
    expect(texts(tree)).toEqual(expect.arrayContaining(['Loves spicy ramen', 'Running a 10k in May', 'A goal', 'What Blue remembers']));
    tree.unmount();
  });

  it('forgets one after a light confirm, and drops it from the list', async () => {
    companionService.memories.mockResolvedValue([memory('m1', 'Loves spicy ramen'), memory('m2', 'Has a dog called Rex')]);
    companionService.forgetMemory.mockResolvedValue({ ok: true });
    const confirm = jest.fn().mockResolvedValue(true);
    const tree = await mount(confirm);
    await act(async () => pressable(tree, (p) => p.testID === 'memory-m1').props.onPress());
    await settle();
    expect(confirm).toHaveBeenCalledWith('Forget this?', expect.stringContaining('Loves spicy ramen'), 'Forget');
    expect(companionService.forgetMemory).toHaveBeenCalledWith('pet-1', 'm1');
    expect(texts(tree)).not.toContain('Loves spicy ramen');
    expect(texts(tree)).toContain('Has a dog called Rex');
    tree.unmount();
  });

  it('keeps the memory when the confirm is declined', async () => {
    companionService.memories.mockResolvedValue([memory('m1', 'Loves spicy ramen')]);
    const tree = await mount(jest.fn().mockResolvedValue(false));
    await act(async () => pressable(tree, (p) => p.testID === 'memory-m1').props.onPress());
    await settle();
    expect(companionService.forgetMemory).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Loves spicy ramen');
    tree.unmount();
  });

  it('forgets everything only once confirmed, then shows the empty state', async () => {
    companionService.memories.mockResolvedValue([memory('m1', 'Loves spicy ramen')]);
    companionService.forgetAllMemories.mockResolvedValue({ ok: true, forgotten: 1 });
    const confirm = jest.fn().mockResolvedValue(true);
    const tree = await mount(confirm);
    await act(async () => button(tree, 'Forget everything').props.onPress());
    await settle();
    expect(confirm).toHaveBeenCalledWith('Forget everything?', expect.any(String), 'Forget everything');
    expect(companionService.forgetAllMemories).toHaveBeenCalledWith('pet-1');
    expect(tree.root.findAll((n: any) => n.props.testID === 'memories-empty').length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('does not forget everything when the confirm is declined', async () => {
    companionService.memories.mockResolvedValue([memory('m1', 'Loves spicy ramen')]);
    const tree = await mount(jest.fn().mockResolvedValue(false));
    await act(async () => button(tree, 'Forget everything').props.onPress());
    await settle();
    expect(companionService.forgetAllMemories).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('says so kindly when there is nothing yet, with no forget-all to press', async () => {
    companionService.memories.mockResolvedValue([]);
    const tree = await mount();
    expect(texts(tree).some((t) => /doesn't remember anything about you yet/.test(t))).toBe(true);
    expect(button(tree, 'Forget everything')).toBeUndefined();
    tree.unmount();
  });
});
