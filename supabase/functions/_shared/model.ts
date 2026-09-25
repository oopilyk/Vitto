/**
 * The one place the pet's voice is generated.
 *
 * Shared by the `companion` function (a reply you are waiting for) and the
 * `notify` function (an unprompted message sent to a closed app). It lives here
 * rather than in either of them because the system prompt is assembled in a
 * very specific way — a byte-identical stable block first, carrying
 * `cache_control`, then the per-user block — and prompt caching fails SILENTLY
 * if a second caller assembles it even slightly differently. One copy, one
 * cache entry, both callers benefit.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import {
  STABLE_SYSTEM_PROMPT,
  humanizeReply,
  renderDynamicSystemPrompt,
  type PetContext,
} from './companion/index.ts';

export const CHAT_MODEL = Deno.env.get('COMPANION_CHAT_MODEL') ?? 'claude-sonnet-5';
export const EXTRACT_MODEL = Deno.env.get('COMPANION_EXTRACT_MODEL') ?? 'claude-haiku-4-5';

/**
 * Well inside an edge function's life. The SDK's own defaults (10 minutes, 3
 * attempts) outlive the request that is waiting on them, which is how chat
 * sends used to hang until the client gave up.
 */
export const MODEL_TIMEOUT_MS = 20_000;

/**
 * Null without a key, and that is a supported state, not a broken one: the
 * feature can be wired up and tested before the secret is set, and an outage
 * degrades to the templated fallback lines rather than an error.
 */
export const anthropic = Deno.env.get('ANTHROPIC_API_KEY')
  ? new Anthropic({ timeout: MODEL_TIMEOUT_MS, maxRetries: 1 })
  : null;

export interface Generated {
  text: string;
  usage: unknown | null;
  /** True when the words came from the templated fallback, not the model. */
  degraded: boolean;
}

export const generate = async (
  ctx: PetContext,
  turns: Anthropic.MessageParam[],
  fallback: () => string,
  label = 'companion',
): Promise<Generated> => {
  if (!anthropic) return { text: fallback(), usage: null, degraded: true };
  try {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      // Deliberately small: replies are one to four sentences, and this is also
      // the ceiling on what any single message can cost.
      max_tokens: 400,
      // Off on purpose. There is nothing here to reason about, and with thinking
      // on (the default on this model) the thinking is billed as output AND
      // counted against max_tokens, so a 400-token budget could be spent before
      // a word of the reply was written.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [
        // Byte-identical for every user, so one cache entry serves everybody.
        { type: 'text', text: STABLE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: renderDynamicSystemPrompt(ctx) },
      ],
      messages: turns,
    });
    const usage = { model: CHAT_MODEL, ...response.usage };
    if (response.stop_reason === 'refusal') return { text: "…okay I'm gonna not touch that one.", usage, degraded: false };
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
    return { text: humanizeReply(text) || '…', usage, degraded: false };
  } catch (error) {
    // A reply the person is waiting on must not become an error page. Log what
    // kind of failure it was, then answer from the templated fallback.
    if (error instanceof Anthropic.APIConnectionTimeoutError) console.error(`[${label}] model timed out after ${MODEL_TIMEOUT_MS}ms`);
    else if (error instanceof Anthropic.RateLimitError) console.error(`[${label}] rate limited`);
    else if (error instanceof Anthropic.AuthenticationError) console.error(`[${label}] ANTHROPIC_API_KEY rejected`);
    else if (error instanceof Anthropic.APIError) console.error(`[${label}] API error ${error.status}: ${error.message}`);
    else console.error(`[${label}] generation failed`, error);
    return { text: fallback(), usage: null, degraded: true };
  }
};
