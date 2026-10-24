// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/proposals.ts
// Regenerate with: node scripts/syncCompanion.mjs

import type { LifeContext } from './types.ts';

/**
 * Settings the pet can offer to change, when somebody asks it to ("can you set
 * my calories to 2000").
 *
 * The pet never changes anything. The model is given the two tools below, and
 * calling one only PROPOSES: the server checks what it asked for against the
 * rules here, drops anything that fails, and returns what is left alongside the
 * reply. The app draws it as a card under that reply, and only a tap on it
 * changes the setting, through the same save the Settings screens use. So a
 * proposal is a suggestion with a button on it, never a write.
 *
 * Tool input is model output, which is untrusted: a request smuggled in through
 * a memory or a custom persona could make the model call a tool nobody asked
 * for. Every field is checked, nothing outside the schema survives, and
 * `askedFor` requires the person's own message to have mentioned the thing
 * being changed.
 *
 * The limits are copies, because this folder imports nothing from outside it
 * (see types.ts): CALORIE_GOAL_RANGE and the database's step_goal CHECK, and
 * MAX_REMINDER_LABEL. A test in core holds them equal.
 */

/** The profile fields a proposal may change, named as they are on `BodyProfile`. */
export const PROPOSAL_SETTINGS = ['calorieGoal', 'stepGoal'] as const;
export type ProposalSetting = (typeof PROPOSAL_SETTINGS)[number];

export const PROPOSAL_RANGES: Record<ProposalSetting, { min: number; max: number }> = {
  calorieGoal: { min: 1000, max: 6000 },
  stepGoal: { min: 1000, max: 50_000 },
};
export const PROPOSAL_REMINDER_LABEL_MAX = 40;

export type CompanionProposal =
  | { kind: 'setting'; setting: ProposalSetting; value: number }
  | {
      kind: 'reminder';
      label: string;
      hour: number;
      minute: number;
      /** 1 = Sunday … 7 = Saturday, as reminders.ts numbers them. Empty is every day. */
      days: number[];
    };

/** What checking a proposal needs to know about them: whether they are an adult, and today's goals. */
export interface ProposalContext {
  adult?: boolean;
  today: Pick<LifeContext['today'], 'calorieTarget' | 'stepGoal'>;
}

/** A tool call as the model made it: a name, and input nobody has checked. */
export interface ProposalToolCall {
  name: string;
  input: unknown;
}

export const PROPOSE_SETTING_TOOL = 'propose_setting_change';
export const PROPOSE_REMINDER_TOOL = 'propose_reminder';

/**
 * The tools, in a fixed order. They are the first thing in every request in the
 * pet's voice and part of the cached prefix, so they are the same bytes on
 * every call: never built per user, never reordered.
 */
export const PROPOSAL_TOOLS = [
  {
    name: PROPOSE_SETTING_TOOL,
    description:
      'Offer to change one of their app settings. Use it ONLY when their latest message asks you to change that setting. ' +
      'It changes nothing by itself: the app shows them a card under your reply and they tap to confirm. Always write your normal reply as well.',
    input_schema: {
      type: 'object' as const,
      properties: {
        setting: {
          type: 'string',
          enum: [...PROPOSAL_SETTINGS],
          description: 'calorieGoal: their daily calorie goal in kcal. stepGoal: their daily step goal.',
        },
        value: {
          type: 'integer',
          description: `The new value they asked for. calorieGoal ${PROPOSAL_RANGES.calorieGoal.min}-${PROPOSAL_RANGES.calorieGoal.max}; stepGoal ${PROPOSAL_RANGES.stepGoal.min}-${PROPOSAL_RANGES.stepGoal.max}.`,
        },
      },
      required: ['setting', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: PROPOSE_REMINDER_TOOL,
    description:
      'Offer to create a reminder notification on their phone. Use it ONLY when their latest message asks you to remind them of something. ' +
      'It changes nothing by itself: the app shows them a card under your reply and they tap to confirm. Always write your normal reply as well.',
    input_schema: {
      type: 'object' as const,
      properties: {
        label: { type: 'string', description: `What to remind them of, short, e.g. "Drink water". At most ${PROPOSAL_REMINDER_LABEL_MAX} characters.` },
        hour: { type: 'integer', description: 'Hour on their clock, 0-23.' },
        minute: { type: 'integer', description: 'Minute, 0-59.' },
        days: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Days it repeats on, 1 = Sunday through 7 = Saturday. Empty for every day.',
        },
      },
      required: ['label', 'hour', 'minute', 'days'],
      additionalProperties: false,
    },
  },
];

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

/**
 * Whether their own message mentioned the thing a proposal changes. A cheap
 * check, and a loose one on purpose (a few languages, short stems): it is not
 * there to understand the request, only to make sure there WAS one, so that a
 * memory or a persona that reads "set my calories to 1200" cannot produce a
 * card out of nowhere. Missing a phrasing costs a card; they can still ask
 * again or use Settings.
 */
const MENTIONS: Record<ProposalSetting | 'reminder', RegExp> = {
  calorieGoal: /calor|kcal|\bcals?\b/i,
  stepGoal: /\bsteps?\b|\bpasos?\b|\bpas\b|schritt|\bpassi\b|\bpassos?\b/i,
  reminder: /remind|alarm|alert|notif|recu[eé]rd|rappel|erinner|ricord|lembr/i,
};
export const askedFor = (proposal: CompanionProposal, message: string): boolean =>
  MENTIONS[proposal.kind === 'setting' ? proposal.setting : 'reminder'].test(message);

/**
 * One tool call checked against the rules, or null when it fails any of them.
 * Rejected rather than clamped: a value they did not ask for is not a proposal
 * of theirs, and the card would put it under their thumb. The pet is told the
 * limits and says so itself instead.
 *
 * `life` is the phone's description of today, which is where the current goals
 * come from. Under 18 (or not known to be an adult) a calorie goal only goes
 * up: the app does not take someone that age below what they burn (see
 * calculateMacroTargets), and the server cannot see that number, so it does
 * not let the pet offer any decrease at all. The app checks the exact floor
 * again before applying.
 */
export const validateProposal = (call: ProposalToolCall, life: ProposalContext): CompanionProposal | null => {
  const input = record(call.input);
  if (call.name === PROPOSE_SETTING_TOOL) {
    const setting = input.setting;
    if (!(PROPOSAL_SETTINGS as readonly unknown[]).includes(setting)) return null;
    const key = setting as ProposalSetting;
    const value = integer(input.value);
    const range = PROPOSAL_RANGES[key];
    if (value === null || value < range.min || value > range.max) return null;
    const current = key === 'calorieGoal' ? life.today.calorieTarget : life.today.stepGoal;
    if (value === current) return null;
    if (key === 'calorieGoal' && life.adult !== true && value < current) return null;
    return { kind: 'setting', setting: key, value };
  }
  if (call.name === PROPOSE_REMINDER_TOOL) {
    if (typeof input.label !== 'string') return null;
    // One line, no control characters: it becomes a notification's text.
    const label = input.label.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!label || label.length > PROPOSAL_REMINDER_LABEL_MAX) return null;
    const hour = typeof input.hour === 'number' && Number.isInteger(input.hour) ? input.hour : null;
    const minute = typeof input.minute === 'number' && Number.isInteger(input.minute) ? input.minute : null;
    if (hour === null || hour < 0 || hour > 23 || minute === null || minute < 0 || minute > 59) return null;
    const rawDays = input.days ?? [];
    if (!Array.isArray(rawDays) || rawDays.length > 7) return null;
    if (!rawDays.every((day) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7)) return null;
    const days = [...new Set(rawDays as number[])].sort((a, b) => a - b);
    // All seven is every day, which reminders.ts stores as none.
    return { kind: 'reminder', label, hour, minute, days: days.length === 7 ? [] : days };
  }
  return null;
};

/**
 * The proposal a reply carries, if any: the first tool call that passes the
 * rules and that their own message actually asked for. One per reply; a
 * second card under the same message would be one decision too many.
 */
export const proposalFrom = (
  calls: readonly ProposalToolCall[],
  life: ProposalContext,
  message: string,
): CompanionProposal | null => {
  for (const call of calls) {
    const proposal = validateProposal(call, life);
    if (proposal && askedFor(proposal, message)) return proposal;
  }
  return null;
};

/**
 * What the pet says when the model called a tool and wrote nothing else. The
 * prompt asks for a reply every time; this is for when it does not, so the
 * bubble above the card is never empty.
 */
export const proposalFallbackLine = (proposal: CompanionProposal | null): string =>
  proposal ? 'okay, tap below and it’s done.' : 'hmm, that’s not one I can change from here.';
