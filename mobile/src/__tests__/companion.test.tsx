import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { PetSpeechBubble, SPEECH_BUBBLE_MS } from '../petWorld/PetSpeechBubble';
import { companion as ai, createPet } from '@vitto/core';

jest.mock('../services/companionService', () => {
  // Written out longhand: a TypeScript parameter property compiles to an
  // assignment jest's mock-factory scope guard mistakes for an outside variable.
  class CompanionLimitError extends Error {
    access: unknown;
    constructor(granted: unknown) {
      super('limit');
      this.name = 'CompanionLimitError';
      this.access = granted;
    }
  }
  return {
    CompanionLimitError,
    companionService: { load: jest.fn(), cached: jest.fn(async () => null), send: jest.fn(), record: jest.fn(), checkIn: jest.fn(), debug: jest.fn(), reset: jest.fn() },
  };
});

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const { companionService, CompanionLimitError } = require('../services/companionService');
const { CompanionChatScreen } = require('../screens/CompanionChatScreen');
const { CompanionDebugScreen } = require('../screens/CompanionDebugScreen');
const { PetWorldHud } = require('../petWorld/PetWorldHud');

const pet = { ...createPet('user-1', 'Blue'), personality: 'energetic' as const };
const life = ai.sanitizeLifeContext({ pet: { name: 'Blue', species: 'bichon puppy' } });
const state = ai.newCompanionState('user-1:pet', Date.now());
const free = ai.accessFor('free', 0);
const message = (id: string, role: 'user' | 'pet', content: string) =>
  ({ id, role, content, createdAt: Date.now(), source: 'reply' as const, triggerKey: null });

const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((t: any) => String(t.props.children));
const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

describe('the message button', () => {
  const hud = (props: Record<string, unknown>) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetWorldHud pet={pet} events={[]} environment="main" formLabel="Level 1"
          onOpenProfile={() => {}} onOpenStats={() => {}} onOpenToday={() => {}} {...props} />,
      );
    });
    return tree;
  };

  it('opens the conversation, and leaves the plaque to the pet', () => {
    let opened = 0;
    const tree = hud({ onOpenChat: () => { opened += 1; } });
    act(() => byLabel(tree, 'Talk to Blue').props.onPress());
    expect(opened).toBe(1);
    // What the pet says at length belongs in the conversation, never here: a
    // few sentences on the plaque pushed the pet and the day's stats off screen.
    expect(texts(tree).some((t) => /I'm feeling/.test(t))).toBe(true);
    expect(texts(tree)).not.toContain('TAP TO TALK');
    tree.unmount();
  });

  it('shows a dot, and says how many, when the pet has spoken', () => {
    const quiet = hud({ onOpenChat: () => {} });
    const noisy = hud({ onOpenChat: () => {}, unreadMessages: 2 });
    expect(byLabel(quiet, 'Talk to Blue')).toBeTruthy();
    expect(byLabel(noisy, 'Talk to Blue, 2 unread')).toBeTruthy();
    // The dot is the only difference in what is drawn.
    const dots = (tree: renderer.ReactTestRenderer) => tree.root.findAllByProps({ testID: 'companion-unread' }).length;
    expect(dots(quiet)).toBe(0);
    expect(dots(noisy)).toBeGreaterThan(0);
    quiet.unmount();
    noisy.unmount();
  });

  it('is absent offline, where there is nobody to talk to', () => {
    const tree = hud({});
    expect(byLabel(tree, 'Talk to Blue')).toBeUndefined();
    tree.unmount();
  });
});

describe('talking to the pet', () => {
  beforeEach(() => jest.clearAllMocks());

  const open = async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<CompanionChatScreen pet={pet} life={life} onClose={() => {}} />); });
    return tree;
  };
  const type = (tree: renderer.ReactTestRenderer, value: string) =>
    act(() => tree.root.findByType(TextInput).props.onChangeText(value));
  const send = async (tree: renderer.ReactTestRenderer) =>
    act(async () => { byLabel(tree, 'Send').props.onPress(); await Promise.resolve(); await Promise.resolve(); });

  it('loads the conversation and how close the two of you are', async () => {
    companionService.load.mockResolvedValue({ state: { ...state, relationshipLevel: 'FRIEND', relationshipScore: 105 }, messages: [message('1', 'pet', 'there you are')], access: free });
    const tree = await open();
    expect(companionService.load).toHaveBeenCalledWith(pet.id, life);
    expect(texts(tree)).toEqual(expect.arrayContaining(['there you are', 'Friends']));
    tree.unmount();
  });

  it('opens on the conversation kept on this phone, before the server answers', async () => {
    companionService.cached.mockResolvedValueOnce({ state, messages: [message('old', 'pet', 'missed you')], access: free });
    companionService.load.mockReturnValue(new Promise(() => {})); // the server has not answered yet
    const tree = await open();
    expect(texts(tree)).toContain('missed you');
    tree.unmount();
  });

  it('sends a message and shows the reply', async () => {
    companionService.load.mockResolvedValue({ state, messages: [], access: free });
    companionService.send.mockResolvedValue({ userMessage: message('u', 'user', 'hello'), reply: message('p', 'pet', 'oh hi!!'), state, access: free, degraded: false });
    const tree = await open();
    type(tree, '  hello  ');
    await send(tree);
    expect(companionService.send).toHaveBeenCalledWith(pet.id, life, 'hello');
    expect(texts(tree)).toEqual(expect.arrayContaining(['hello', 'oh hi!!']));
    expect(tree.root.findByType(TextInput).props.value).toBe('');
    tree.unmount();
  });

  it('sends from the keyboard\'s Return key, closing the keyboard rather than starting a new line', async () => {
    companionService.load.mockResolvedValue({ messages: [], state, access: free });
    companionService.send.mockResolvedValue({ userMessage: message('u', 'user', 'hello'), reply: message('p', 'pet', 'oh hi!!'), state, access: free, degraded: false });
    const tree = await open();
    const input = tree.root.findByType(TextInput);
    expect(input.props.returnKeyType).toBe('send');
    expect(input.props.submitBehavior).toBe('blurAndSubmit');
    type(tree, 'hello');
    await act(async () => { tree.root.findByType(TextInput).props.onSubmitEditing(); });
    expect(companionService.send).toHaveBeenCalledWith(pet.id, life, 'hello');
  });

  it('never loses what was typed when a send fails', async () => {
    companionService.load.mockResolvedValue({ state, messages: [], access: free });
    companionService.send.mockRejectedValue(new Error('Could not reach the server.'));
    const tree = await open();
    type(tree, 'long heartfelt message');
    await send(tree);
    expect(tree.root.findByType(TextInput).props.value).toBe('long heartfelt message');
    expect(texts(tree)).toContain('Could not reach the server.');
    // And the optimistic bubble is withdrawn rather than left looking sent.
    expect(texts(tree).filter((t) => t === 'long heartfelt message')).toHaveLength(0);
    tree.unmount();
  });

  it('does not hand the draft back when the message did arrive, so nothing is sent twice', async () => {
    // The server stores the message before it asks the model. A timeout after
    // that point means "arrived, reply lost" — restoring the draft there invites
    // a duplicate send.
    companionService.load
      .mockResolvedValueOnce({ state, messages: [], access: free })
      .mockResolvedValueOnce({ state, messages: [message('u1', 'user', 'did you get this')], access: free });
    companionService.send.mockRejectedValue(new Error('That is taking too long.'));
    const tree = await open();
    type(tree, 'did you get this');
    await send(tree);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(tree.root.findByType(TextInput).props.value).toBe('');
    // Shown once, from the server's copy — not once pending and once stored.
    expect(texts(tree).filter((t) => t === 'did you get this')).toHaveLength(1);
    expect(texts(tree)).toContain('That is taking too long.');
    tree.unmount();
  });

  it('draws every message of a long thread, and a new one the moment it is sent', async () => {
    // A virtualized list rendered new rows in scroll-driven batches, so a message
    // sent into a long thread was a blank gap while the pet "thought".
    const long = Array.from({ length: 40 }, (_, i) => message(`m${i}`, i % 2 ? 'pet' : 'user', `line ${i}`));
    companionService.load.mockResolvedValue({ state, messages: long, access: free });
    let release!: () => void;
    companionService.send.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({ userMessage: message('u', 'user', 'brand new'), reply: message('p', 'pet', 'got it'), state, access: free, degraded: false });
    }));
    const tree = await open();
    for (const i of [0, 17, 39]) expect(texts(tree)).toContain(`line ${i}`);
    type(tree, 'brand new');
    await act(async () => { byLabel(tree, 'Send').props.onPress(); await Promise.resolve(); });
    // Still in flight: the person's own words are already on screen.
    expect(texts(tree)).toContain('brand new');
    expect(texts(tree)).toContain('Blue is thinking…');
    await act(async () => { release(); await Promise.resolve(); await Promise.resolve(); });
    expect(texts(tree)).toContain('got it');
    tree.unmount();
  });

  it('meets the daily limit with an explanation instead of a composer', async () => {
    companionService.load.mockResolvedValue({ state, messages: [], access: free });
    companionService.send.mockRejectedValue(new CompanionLimitError(ai.accessFor('free', 30)));
    const tree = await open();
    type(tree, 'one more');
    await send(tree);
    expect(texts(tree)).toContain('Blue is all talked out for today.');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    tree.unmount();
  });

  it('warns as the allowance runs down', async () => {
    companionService.load.mockResolvedValue({ state, messages: [], access: ai.accessFor('free', ai.TIER_LIMITS.free.messagesPerDay - 3) });
    const tree = await open();
    expect(texts(tree)).toContain('3 messages left today');
    tree.unmount();
  });
});

describe('a change the pet offers', () => {
  beforeEach(() => jest.clearAllMocks());

  // Today's target is 2,300 kcal, so the card can say where it is coming from.
  const today = ai.sanitizeLifeContext({ pet: { name: 'Blue' }, adult: true, today: { calorieTarget: 2300, stepGoal: 8000 } });
  const calories = { kind: 'setting' as const, setting: 'calorieGoal' as const, value: 2000 };
  const open = async (onApplyProposal?: (proposal: unknown) => Promise<void>, proposal: unknown = calories) => {
    companionService.load.mockResolvedValue({ state, messages: [], access: free });
    companionService.send.mockResolvedValue({
      userMessage: message('u', 'user', 'yo can you change my daily calories to 2000'),
      reply: message('p', 'pet', 'say less'),
      state, access: free, degraded: false, proposal,
    });
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<CompanionChatScreen pet={pet} life={today} onClose={() => {}} onApplyProposal={onApplyProposal} />);
    });
    act(() => tree.root.findByType(TextInput).props.onChangeText('yo can you change my daily calories to 2000'));
    await act(async () => { byLabel(tree, 'Send').props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    return tree;
  };

  it('shows it under the reply it came with, from the current value to the new one', async () => {
    const tree = await open(jest.fn(async () => {}));
    expect(texts(tree)).toEqual(expect.arrayContaining(['say less', 'Daily calories: 2,300 → 2,000']));
    expect(byLabel(tree, 'Change')).toBeTruthy();
    expect(byLabel(tree, 'Cancel')).toBeTruthy();
    tree.unmount();
  });

  it('applies the value on Change, says so, and cannot apply it twice', async () => {
    const apply = jest.fn(async () => {});
    const tree = await open(apply);
    const change = byLabel(tree, 'Change');
    await act(async () => { change.props.onPress(); change.props.onPress(); await Promise.resolve(); });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(calories);
    expect(texts(tree)).toContain('Changed');
    expect(byLabel(tree, 'Change')).toBeUndefined();
    expect(require('expo-haptics').notificationAsync).toHaveBeenCalledWith('success');
    tree.unmount();
  });

  it('changes nothing on Cancel', async () => {
    const apply = jest.fn(async () => {});
    const tree = await open(apply);
    await act(async () => { byLabel(tree, 'Cancel').props.onPress(); });
    expect(apply).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Cancelled');
    expect(byLabel(tree, 'Change')).toBeUndefined();
    tree.unmount();
  });

  it('shows why it could not be applied, and lets it be tried again', async () => {
    const apply = jest.fn().mockRejectedValueOnce(new Error('Under 18, your daily calories stay at 2,400 or more.')).mockResolvedValueOnce(undefined);
    const tree = await open(apply);
    await act(async () => { byLabel(tree, 'Change').props.onPress(); await Promise.resolve(); });
    expect(texts(tree)).toContain('Under 18, your daily calories stay at 2,400 or more.');
    await act(async () => { byLabel(tree, 'Change').props.onPress(); await Promise.resolve(); });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(texts(tree)).toContain('Changed');
    tree.unmount();
  });

  it('offers a reminder with its time and days', async () => {
    const apply = jest.fn(async () => {});
    const water = { kind: 'reminder' as const, label: 'Drink water', hour: 15, minute: 0, days: [] };
    const tree = await open(apply, water);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Reminder: Drink water', '3:00 pm · Every day']));
    await act(async () => { byLabel(tree, 'Add reminder').props.onPress(); await Promise.resolve(); });
    expect(apply).toHaveBeenCalledWith(water);
    expect(texts(tree)).toContain('Added');
    tree.unmount();
  });

  it('draws no card without a proposal, or without a way to apply one', async () => {
    const none = await open(jest.fn(async () => {}), null);
    expect(byLabel(none, 'Change')).toBeUndefined();
    none.unmount();
    const unwired = await open(undefined);
    expect(texts(unwired)).toContain('say less');
    expect(byLabel(unwired, 'Change')).toBeUndefined();
    unwired.unmount();
  });

  it('does not bring a card back when the conversation is reloaded', async () => {
    const tree = await open(jest.fn(async () => {}));
    expect(byLabel(tree, 'Change')).toBeTruthy();
    tree.unmount();
    // A fresh screen loads the stored messages, which never carry a proposal.
    companionService.load.mockResolvedValue({ state, messages: [message('p', 'pet', 'say less')], access: free });
    let again!: renderer.ReactTestRenderer;
    await act(async () => {
      again = renderer.create(<CompanionChatScreen pet={pet} life={today} onClose={() => {}} onApplyProposal={jest.fn()} />);
    });
    expect(texts(again)).toContain('say less');
    expect(byLabel(again, 'Change')).toBeUndefined();
    again.unmount();
  });
});

describe('the debug screen', () => {
  const { withSurveyDefaults } = require('@vitto/core');
  const profile = withSurveyDefaults({ age: 30, sex: 'male', heightCm: 180, heightUnit: 'cm', weightKg: 80, weightUnit: 'kg', activity: 'moderate', goal: 'maintain' });
  const report = {
    provider: 'claude-sonnet-5',
    state: { ...state, mood: 'hungry', moodReason: 'your tummy is loud', relationshipLevel: 'FRIEND', relationshipScore: 88 },
    counts: { memories: 1, events: 2, messages: 4 },
    usage: { sent: 3, proactive: 1 },
    access: ai.accessFor('free', 3),
    trigger: { key: 'streak_at_risk', situation: 'Nothing logged yet and it is evening.', priority: 3 },
    voice: 'SAVAGE. You are deadpan and merciless.',
    memories: [{ id: 'm1', category: 'goal', content: 'User is training for a half marathon', importance: 0.8, confidence: 0.9, createdAt: Date.now(), lastReferencedAt: Date.now(), referenceCount: 1, expiresAt: null, eventDate: null, followedUpAt: null, source: 'extraction', active: true }],
    recentEvents: [{ type: 'WORKOUT_COMPLETED', ago: '2 h ago', metadata: { kind: 'strength' } }],
    patterns: [{ key: 'week_activity', description: 'Worked out 3 times in the last 7 days', confidence: 1 }],
    selected: [{ id: 'm1', category: 'goal', content: 'User is training for a half marathon', score: 0.62 }],
    prompt: { stable: 'x'.repeat(5500), dynamic: '# Who you are\nYou are Blue.', turns: [] },
    tokens: { stable: 1381, dynamic: 697, history: 164 },
  };

  const open = async (over: Record<string, unknown> = {}) => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <CompanionDebugScreen pet={{ ...pet, personality: 'savage' }} events={[]} profile={profile} stepGoal={8000}
          onChangePersonality={() => {}} onOpenChat={() => {}} onClose={() => {}} {...over} />,
      );
    });
    return tree;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    companionService.debug.mockResolvedValue(report);
  });

  it('reads the companion without spending anything', async () => {
    const tree = await open();
    // The whole point: opening the screen inspects the prompt, the trigger and
    // the memories, and never reaches the model.
    expect(companionService.debug).toHaveBeenCalledTimes(1);
    expect(companionService.checkIn).not.toHaveBeenCalled();
    expect(companionService.send).not.toHaveBeenCalled();
    const shown = texts(tree).join(' | ');
    expect(shown).toContain('claude-sonnet-5');
    expect(shown).toContain('streak_at_risk');
    expect(shown).toContain('half marathon');
    expect(shown).toMatch(/1381 cached \+ 697 dynamic \+ 164 history/);
    tree.unmount();
  });

  it('previews every temperament at once, on the device, with no call', async () => {
    const tree = await open();
    const shown = texts(tree).join(' | ');
    for (const label of ['Feisty', 'Cute', 'Sweet', 'Savage']) expect(shown).toContain(label);
    // The sample line rendered four different ways.
    expect(shown).toMatch(/Fight me\.|I said what I said\.|Try me\./);
    expect(shown).toMatch(/Incredible\. Truly\.|Sure\. Great plan\.|Wow\. Okay\./);
    expect(companionService.debug).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('switches the character in place, once you save it', async () => {
    const picked: unknown[] = [];
    const tree = await open({ onChangePersonality: (...args: unknown[]) => picked.push(args) });
    // Picking a base is a draft; nothing reaches the pet until Save. Same
    // editor as Settings, so a slider dragged through five stops is one re-seed.
    const chip = tree.root.findAll((n: any) => typeof n.props.onPress === 'function')
      .find((n: any) => n.findAllByType(Text).some((t: any) => t.props.children === 'Feisty'));
    act(() => chip!.props.onPress());
    expect(picked).toEqual([]);
    const save = () => tree.root.findAll((n: any) => typeof n.props.onPress === 'function')
      .find((n: any) => n.findAllByType(Text).some((t: any) => t.props.children === 'Save character'));
    act(() => save()!.props.onPress());
    expect(picked).toHaveLength(1);
    expect(picked[0]).toMatchObject([ 'feisty', '', expect.objectContaining({ blunt: 0.75 }) ]);
    tree.unmount();
  });

  it('only calls the model when a button says it will', async () => {
    companionService.checkIn.mockResolvedValue({ message: { ...message('p', 'pet', 'oh good, you.'), source: 'proactive' }, trigger: 'streak_at_risk', state });
    const tree = await open();
    const speak = tree.root.findAll((n: any) => typeof n.props.onPress === 'function')
      .find((n: any) => n.findAllByType(Text).some((t: any) => String(t.props.children).includes('costs one call')));
    await act(async () => { speak!.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(companionService.checkIn).toHaveBeenCalledWith(pet.id, expect.anything());
    expect(texts(tree).join(' | ')).toContain('oh good, you.');
    tree.unmount();
  });

  it('says so, rather than failing silently, when the companion cannot be read', async () => {
    companionService.debug.mockRejectedValue(new Error('Not available.'));
    const tree = await open();
    expect(texts(tree)).toContain('Not available.');
    tree.unmount();
  });
});

describe('the pet speaking from over its head', () => {
  it('puts the bubble away from its ×, without opening the chat', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<PetSpeechBubble said={{ id: 'm9', text: 'nice benches' }} petName="Blue" onPress={() => { opened += 1; }} />); });
    const find = (id: string) => tree.root.findAll((node) => node.props.testID === id && typeof node.props.onPress === 'function');
    expect(find('companion-bubble')).toHaveLength(1);
    act(() => find('companion-bubble-close')[0]!.props.onPress());
    expect(find('companion-bubble')).toHaveLength(0);
    expect(opened).toBe(0);
    tree.unmount();
  });

  it('shows what it said, opens the chat on a tap, then lets it go', () => {
    jest.useFakeTimers();
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    const said = { id: 'm1', text: 'there you are. took you long enough' };
    act(() => { tree = renderer.create(<PetSpeechBubble said={said} petName="Blue" onPress={() => { opened += 1; }} />); });
    const bubbles = () => tree.root.findAll((node) => node.props.testID === 'companion-bubble' && typeof node.props.onPress === 'function');
    expect(bubbles().length).toBeGreaterThan(0);
    expect(bubbles()[0]!.props.accessibilityLabel).toBe('Blue says: there you are. took you long enough');
    act(() => { bubbles()[0]!.props.onPress(); });
    expect(opened).toBe(1);
    // Still up just short of thirty seconds, gone just after.
    act(() => { jest.advanceTimersByTime(SPEECH_BUBBLE_MS - 500); });
    expect(bubbles().length).toBeGreaterThan(0);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(bubbles().length).toBe(0);
    // The same message again is a re-render, not something new to say.
    act(() => { tree.update(<PetSpeechBubble said={{ ...said }} petName="Blue" />); });
    expect(bubbles().length).toBe(0);
    // A new message speaks again.
    act(() => { tree.update(<PetSpeechBubble said={{ id: 'm2', text: 'hi' }} petName="Blue" onPress={() => {}} />); });
    expect(bubbles().length).toBeGreaterThan(0);
    act(() => { tree.unmount(); });
    jest.useRealTimers();
  });
});
