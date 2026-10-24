/**
 * The shape of a call in the pet's voice: system blocks, model settings and
 * the reply's post-processing. Kept apart from model.ts, which needs Deno and
 * a live client, so that the voice eval (evals/companion-voice) sends exactly
 * the request production sends instead of a copy that could drift from it.
 */
import type Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import { PROPOSAL_TOOLS, STABLE_SYSTEM_PROMPT, renderDynamicSystemPrompt, type PetContext } from './companion/index.ts';

/**
 * `effort` is not accepted by every model; sent to one that does not take it,
 * the whole request fails. Only the Sonnet/Opus family gets it.
 */
export const takesEffort = (model: string) => /sonnet|opus/.test(model);

/** The two system blocks every call in the pet's voice sends, in the order that keeps the cache. */
export const systemFor = (ctx: PetContext): Anthropic.TextBlockParam[] => [
  // Byte-identical for every user, so one cache entry serves everybody.
  { type: 'text', text: STABLE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: renderDynamicSystemPrompt(ctx) },
];

/**
 * The proposal tools (see companion/proposals.ts), sent on EVERY call in the
 * pet's voice, whether or not it may use them. Tools come before the system
 * prompt in the cached prefix, so a call that left them out would be a second
 * cache entry for the same prompt. Whether they may be used is `tool_choice`,
 * which can change per request without touching that cache.
 */
export const companionTools = PROPOSAL_TOOLS as Anthropic.Tool[];

/** Tools present but off: what every call but a reply to the person sends. */
export const noTools = { tools: companionTools, tool_choice: { type: 'none' as const } };

/**
 * A chat reply's request: everything but the client. `proposals` lets the
 * model offer a settings change, and is only on for a reply to something the
 * person just said; at most one call, since a reply carries at most one card.
 */
export const chatRequest = (ctx: PetContext, turns: Anthropic.MessageParam[], model: string, { proposals = false } = {}) => ({
  model,
  // Deliberately small: replies are one to four sentences, and this is also
  // the ceiling on what any single message can cost.
  max_tokens: 400,
  // Off on purpose. There is nothing here to reason about, and with thinking
  // on (the default on this model) the thinking is billed as output AND
  // counted against max_tokens, so a 400-token budget could be spent before
  // a word of the reply was written.
  thinking: { type: 'disabled' as const },
  ...(takesEffort(model) ? { output_config: { effort: 'low' as const } } : {}),
  system: systemFor(ctx),
  ...(proposals ? { tools: companionTools, tool_choice: { type: 'auto' as const, disable_parallel_tool_use: true } } : noTools),
  messages: turns,
});
