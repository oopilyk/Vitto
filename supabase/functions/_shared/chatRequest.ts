/**
 * The shape of a call in the pet's voice: system blocks, model settings and
 * the reply's post-processing. Kept apart from model.ts, which needs Deno and
 * a live client, so that the voice eval (evals/companion-voice) sends exactly
 * the request production sends instead of a copy that could drift from it.
 */
import type Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import { STABLE_SYSTEM_PROMPT, renderDynamicSystemPrompt, type PetContext } from './companion/index.ts';

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

/** A chat reply's request: everything but the client. */
export const chatRequest = (ctx: PetContext, turns: Anthropic.MessageParam[], model: string) => ({
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
  messages: turns,
});
