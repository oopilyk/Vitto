import { describe, expect, it } from 'vitest';
import {
  DAY,
  PUSH_LINE_KINDS,
  eventLineKind,
  lifeForTier,
  newCompanionState,
  parsePushLines,
  pickProactiveTrigger,
  pickPushLine,
  pushVoiceKey,
  sanitizeLifeContext,
  TIER_LIMITS,
  worthRemembering,
  type LifeContext,
} from './index';

const life = (pet: Partial<LifeContext['pet']> = {}): LifeContext =>
  sanitizeLifeContext({ pet: { name: 'Blue', species: 'bear', ageDays: 19, level: 12, build: 'Runner', ...pet } });

describe('free tier', () => {
  it('has the lower caps', () => {
    expect(TIER_LIMITS.free).toMatchObject({ messagesPerDay: 10, proactivePerDay: 2 });
    expect(TIER_LIMITS.plus).toMatchObject({ messagesPerDay: 200, proactivePerDay: 12 });
  });

  it('speaks without a personality, whatever the phone sent', () => {
    const chosen = { ...life(), pet: { ...life().pet, temperament: 'menace', persona: 'a pirate', dials: { playful: 1, blunt: 1, energetic: 1, sarcastic: 1, clingy: 1 } } };
    const free = lifeForTier(chosen, 'free');
    expect(free.pet.temperament).toBeUndefined();
    expect(free.pet.persona).toBeUndefined();
    expect(free.pet.dials).toBeUndefined();
    expect(free.pet.name).toBe('Blue');
    expect(lifeForTier(chosen, 'plus')).toBe(chosen);
  });
});

describe('worthRemembering', () => {
  it('skips chatter', () => {
    for (const text of ['lol', 'ok', 'hahaha nice', 'how are you doing', 'what is up with you']) expect(worthRemembering(text)).toBe(false);
  });
  it('keeps what a friend would remember', () => {
    for (const text of [
      'I have an exam tomorrow and I am nervous',
      'my sister is visiting this weekend',
      "I'm training for a half marathon",
      'I really hate running in the rain',
      'call me chief from now on okay',
      'interview on friday, wish me luck',
    ]) expect(worthRemembering(text)).toBe(true);
  });
});

describe('push lines', () => {
  const full = Object.fromEntries(PUSH_LINE_KINDS.map((kind) => [kind, [`${kind} one`, `${kind} two`]]));

  it('parses a bank, dropping lines with placeholders the kind cannot fill', () => {
    const bank = parsePushLines(`here:\n${JSON.stringify({ ...full, absence: ['{days} days, really?', 'gone {weekday}?'] })}`);
    expect(bank?.absence).toEqual(['{days} days, really?']);
    expect(bank?.['event:MEAL_LOGGED']).toHaveLength(2);
  });

  it('rejects a reply with too little in it', () => {
    expect(parsePushLines('{"absence": ["hi"]}')).toBeNull();
    expect(parsePushLines('not json')).toBeNull();
  });

  it('picks a filled line, avoiding ones sent recently', () => {
    const bank = { streak_at_risk: ['{streak} days! keep it going', 'dont break our {streak}-day thing'] };
    expect(pickPushLine(bank, 'streak_at_risk', { streak: 5 }, ['5 days! keep it going'], 0)).toBe('dont break our 5-day thing');
    // Falls back to the general set, and to null when there is nothing.
    expect(pickPushLine({ thinking_of_you: ['hi'] }, 'absence', { days: 3 }, [], 1)).toBe('hi');
    expect(pickPushLine({}, 'absence', {}, [], 0)).toBeNull();
  });

  it('tells a personal best from a plain workout', () => {
    expect(eventLineKind({ type: 'WORKOUT_COMPLETED', metadata: { personalRecords: ['bench'] } })).toBe('event:PERSONAL_RECORD');
    expect(eventLineKind({ type: 'WORKOUT_COMPLETED', metadata: {} })).toBe('event:WORKOUT_COMPLETED');
  });

  it('rewrites the bank when the voice changes', () => {
    expect(pushVoiceKey(life(), 'free')).toBe(pushVoiceKey(life(), 'free'));
    expect(pushVoiceKey(life({ temperament: 'menace' }), 'plus')).not.toBe(pushVoiceKey(life(), 'plus'));
    expect(pushVoiceKey(life(), 'plus')).not.toBe(pushVoiceKey(life(), 'free'));
  });

  it('tags every trigger with a line kind it has lines for', () => {
    const now = Date.parse('2026-09-30T20:00:00Z');
    const fire = pickProactiveTrigger({ state: newCompanionState('k', now - 10 * DAY), events: [], memories: [], recentMessages: [], life: life(), now });
    expect(fire?.key).toBe('absence');
    expect(PUSH_LINE_KINDS).toContain(fire!.lineKind);
    expect(fire!.lineVars).toEqual({ days: 10 });
  });
});
