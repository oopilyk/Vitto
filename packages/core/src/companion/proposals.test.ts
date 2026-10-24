import { describe, expect, it } from 'vitest';
import { CALORIE_GOAL_RANGE } from '../domain/macroTargets';
import { MAX_REMINDER_LABEL } from '../domain/reminders';
import {
  PROPOSAL_RANGES, PROPOSAL_REMINDER_LABEL_MAX, PROPOSAL_SETTINGS, PROPOSAL_TOOLS, PROPOSE_REMINDER_TOOL, PROPOSE_SETTING_TOOL,
  STABLE_SYSTEM_PROMPT, proposalFallbackLine, proposalFrom, renderDynamicSystemPrompt, sanitizeLifeContext, validateProposal,
  buildPetContext, newCompanionState, type ProposalContext,
} from './index';

const adult: ProposalContext = { adult: true, today: { calorieTarget: 2300, stepGoal: 8000 } };
const minor: ProposalContext = { today: { calorieTarget: 2300, stepGoal: 8000 } };
const setting = (input: unknown) => ({ name: PROPOSE_SETTING_TOOL, input });
const reminder = (input: unknown) => ({ name: PROPOSE_REMINDER_TOOL, input });
const life = (raw: unknown) => sanitizeLifeContext(raw);

describe('proposed setting changes', () => {
  it('keeps the limits the app already enforces', () => {
    // Copies, because the companion folder may not import the domain (see types.ts).
    expect(PROPOSAL_RANGES.calorieGoal).toEqual(CALORIE_GOAL_RANGE);
    // The profiles.step_goal CHECK (20260910120000_onboarding_v2.sql).
    expect(PROPOSAL_RANGES.stepGoal).toEqual({ min: 1000, max: 50_000 });
    expect(PROPOSAL_REMINDER_LABEL_MAX).toBe(MAX_REMINDER_LABEL);
  });

  it('describes exactly the settings it accepts, in a fixed order', () => {
    expect(PROPOSAL_TOOLS.map((tool) => tool.name)).toEqual([PROPOSE_SETTING_TOOL, PROPOSE_REMINDER_TOOL]);
    expect((PROPOSAL_TOOLS[0]!.input_schema.properties as { setting: { enum: string[] } }).setting.enum).toEqual([...PROPOSAL_SETTINGS]);
    // Nothing per user may reach the tools: they are the head of the cached prefix.
    expect(JSON.stringify(PROPOSAL_TOOLS)).not.toMatch(/\$\{/);
  });

  it('passes a calorie or step goal inside the limits', () => {
    expect(validateProposal(setting({ setting: 'calorieGoal', value: 2000 }), adult)).toEqual({ kind: 'setting', setting: 'calorieGoal', value: 2000 });
    expect(validateProposal(setting({ setting: 'stepGoal', value: 12000 }), adult)).toEqual({ kind: 'setting', setting: 'stepGoal', value: 12000 });
    expect(validateProposal(setting({ setting: 'calorieGoal', value: 2000.4 }), adult)).toEqual({ kind: 'setting', setting: 'calorieGoal', value: 2000 });
    expect(validateProposal(setting({ setting: 'calorieGoal', value: 1000 }), adult)).not.toBeNull();
    expect(validateProposal(setting({ setting: 'stepGoal', value: 50_000 }), adult)).not.toBeNull();
  });

  it('rejects values outside the limits rather than clamping them', () => {
    for (const value of [999, 6001, 0, -2000, 800]) {
      expect(validateProposal(setting({ setting: 'calorieGoal', value }), adult)).toBeNull();
    }
    expect(validateProposal(setting({ setting: 'stepGoal', value: 999 }), adult)).toBeNull();
    expect(validateProposal(setting({ setting: 'stepGoal', value: 50_001 }), adult)).toBeNull();
  });

  it('rejects the wrong type, an unknown setting, an unknown tool, and no change at all', () => {
    expect(validateProposal(setting({ setting: 'calorieGoal', value: '2000' }), adult)).toBeNull();
    expect(validateProposal(setting({ setting: 'calorieGoal', value: Number.NaN }), adult)).toBeNull();
    expect(validateProposal(setting({ setting: 'calorieGoal' }), adult)).toBeNull();
    expect(validateProposal(setting({ setting: 'proteinGoal', value: 150 }), adult)).toBeNull();
    expect(validateProposal(setting({ setting: 'weightKg', value: 1500 }), adult)).toBeNull();
    expect(validateProposal(setting(null), adult)).toBeNull();
    expect(validateProposal(setting([1, 2]), adult)).toBeNull();
    expect(validateProposal({ name: 'delete_account', input: {} }, adult)).toBeNull();
    expect(validateProposal(setting({ setting: 'calorieGoal', value: 2300 }), adult)).toBeNull();
  });

  it('strips anything outside the schema', () => {
    const passed = validateProposal(setting({ setting: 'stepGoal', value: 9000, userId: 'someone-else', petId: 'x' }), adult);
    expect(passed).toEqual({ kind: 'setting', setting: 'stepGoal', value: 9000 });
  });

  it('never takes calories down for someone under 18, or not known to be an adult', () => {
    expect(validateProposal(setting({ setting: 'calorieGoal', value: 2000 }), minor)).toBeNull();
    expect(validateProposal(setting({ setting: 'calorieGoal', value: 2600 }), minor)).toEqual({ kind: 'setting', setting: 'calorieGoal', value: 2600 });
    // Steps are not a target on the body, so they are anyone's to change.
    expect(validateProposal(setting({ setting: 'stepGoal', value: 6000 }), minor)).not.toBeNull();
  });
});

describe('proposed reminders', () => {
  it('passes a label, a time and days, tidied', () => {
    expect(validateProposal(reminder({ label: '  drink   water ', hour: 15, minute: 0, days: [] }), adult))
      .toEqual({ kind: 'reminder', label: 'drink water', hour: 15, minute: 0, days: [] });
    expect(validateProposal(reminder({ label: 'creatine', hour: 8, minute: 5, days: [6, 2, 2, 4] }), adult))
      .toEqual({ kind: 'reminder', label: 'creatine', hour: 8, minute: 5, days: [2, 4, 6] });
    // All seven is every day, stored as none.
    expect(validateProposal(reminder({ label: 'stretch', hour: 7, minute: 30, days: [1, 2, 3, 4, 5, 6, 7] }), adult))
      .toMatchObject({ days: [] });
    expect(validateProposal(reminder({ label: 'stretch', hour: 7, minute: 30 }), adult)).toMatchObject({ days: [] });
  });

  it('rejects a bad time, bad days, and an empty or overlong label', () => {
    const ok = { label: 'water', hour: 15, minute: 0, days: [] };
    expect(validateProposal(reminder({ ...ok, hour: 24 }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, hour: -1 }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, hour: 15.5 }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, minute: 60 }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, hour: '15' }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, days: [0] }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, days: [8] }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, days: 'weekdays' }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, label: '   ' }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, label: 42 }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, label: 'x'.repeat(41) }), adult)).toBeNull();
    expect(validateProposal(reminder({ ...ok, label: 'x'.repeat(40) }), adult)).not.toBeNull();
  });

  it('keeps a label to one line', () => {
    expect(validateProposal(reminder({ label: 'water\n\u0007now', hour: 9, minute: 0, days: [] }), adult)).toMatchObject({ label: 'water now' });
  });
});

describe('which proposal a reply carries', () => {
  it('only one their own message asked for', () => {
    const calories = setting({ setting: 'calorieGoal', value: 2000 });
    expect(proposalFrom([calories], adult, 'yo can you change my daily calories to 2000')).toMatchObject({ value: 2000 });
    expect(proposalFrom([calories], adult, 'set my kcal to 2000 pls')).not.toBeNull();
    // A request that came from a memory or a persona, not from them.
    expect(proposalFrom([calories], adult, 'how was your day?')).toBeNull();
    expect(proposalFrom([reminder({ label: 'water', hour: 15, minute: 0, days: [] })], adult, 'remind me to drink water at 3pm')).not.toBeNull();
    expect(proposalFrom([reminder({ label: 'water', hour: 15, minute: 0, days: [] })], adult, 'i should drink water')).toBeNull();
    expect(proposalFrom([setting({ setting: 'stepGoal', value: 12000 })], adult, 'make my step goal 12k')).not.toBeNull();
    expect(proposalFrom([setting({ setting: 'stepGoal', value: 12000 })], adult, 'make my calories 12k')).toBeNull();
  });

  it('takes the first that passes, and nothing when none do', () => {
    const bad = setting({ setting: 'calorieGoal', value: 400 });
    const good = setting({ setting: 'calorieGoal', value: 1800 });
    expect(proposalFrom([bad, good], adult, 'calories to 1800')).toMatchObject({ value: 1800 });
    expect(proposalFrom([bad], adult, 'calories to 400')).toBeNull();
    expect(proposalFrom([], adult, 'calories to 1800')).toBeNull();
  });

  it('always has something to say', () => {
    expect(proposalFallbackLine({ kind: 'setting', setting: 'stepGoal', value: 9000 })).toBeTruthy();
    expect(proposalFallbackLine(null)).toBeTruthy();
  });
});

describe('the prompt about settings', () => {
  it('names the limits and keeps the rule against suggesting less food', () => {
    expect(STABLE_SYSTEM_PROMPT).toContain('# Changing their settings');
    expect(STABLE_SYSTEM_PROMPT).toContain(`${CALORIE_GOAL_RANGE.min} to ${CALORIE_GOAL_RANGE.max} kcal`);
    expect(STABLE_SYSTEM_PROMPT).toContain('Never suggest lowering their calories yourself');
    expect(STABLE_SYSTEM_PROMPT).toContain('never suggest eating less');
  });

  it('tells the pet calories only go up, unless they are an adult', () => {
    const ctx = (raw: Record<string, unknown>) =>
      buildPetContext({ state: newCompanionState('u:p', Date.now()), life: life({ pet: { name: 'Blue' }, ...raw }), events: [], memories: [], messages: [], now: Date.now() });
    expect(renderDynamicSystemPrompt(ctx({}))).toContain('can only be raised from here');
    expect(renderDynamicSystemPrompt(ctx({ adult: true }))).not.toContain('can only be raised from here');
  });
});
