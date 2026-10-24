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
import { humanizeReply, type CompanionTier, type PetContext, type ProposalToolCall } from './companion/index.ts';
import { chatRequest, noTools, systemFor, takesEffort } from './chatRequest.ts';

/**
 * Plus chat with a built-in personality. The personalities are written out in
 * full in the prompt (voice, examples, limits), which a smaller model follows
 * well, so Plus runs on the cheaper model too. See evals/companion-voice for
 * the side-by-side check against the Sonnet replies it replaced.
 */
export const CHAT_MODEL = Deno.env.get('COMPANION_CHAT_MODEL') ?? 'claude-haiku-4-5';
/**
 * Plus with a character the person wrote themselves ("Your own"). The same
 * model as the built-in characters: a stronger one held an invented voice a
 * little better, at about three times the price of every message, which a
 * subscription cannot carry for someone who chats all day. Set
 * COMPANION_CUSTOM_MODEL to try another without a deploy.
 */
export const CUSTOM_CHARACTER_MODEL = Deno.env.get('COMPANION_CUSTOM_MODEL') ?? 'claude-haiku-4-5';
/**
 * Free: a much cheaper model for the same prompt. Free is the tier that costs
 * money without paying any, so it is where the price per message matters most.
 */
export const FREE_CHAT_MODEL = Deno.env.get('COMPANION_FREE_CHAT_MODEL') ?? 'claude-haiku-4-5';
export const EXTRACT_MODEL = Deno.env.get('COMPANION_EXTRACT_MODEL') ?? 'claude-haiku-4-5';

/**
 * The model a pet speaks with. `temperament` is the one the phone sent, after
 * lifeForTier: a free pet never has one, so free is always the free model.
 */
export const chatModelFor = (tier: CompanionTier, temperament?: string): string =>
  tier !== 'plus' ? FREE_CHAT_MODEL : temperament === 'custom' ? CUSTOM_CHARACTER_MODEL : CHAT_MODEL;

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
  /**
   * The proposal tools the model called, unchecked. Only ever non-empty when
   * the caller passed `proposals`; see companion/proposals.ts for what is
   * done with them. Never sent to a phone as they are.
   */
  toolCalls: ProposalToolCall[];
}

export const generate = async (
  ctx: PetContext,
  turns: Anthropic.MessageParam[],
  fallback: () => string,
  label = 'companion',
  model = CHAT_MODEL,
  { proposals = false } = {},
): Promise<Generated> => {
  if (!anthropic) return { text: fallback(), usage: null, degraded: true, toolCalls: [] };
  try {
    const response = await anthropic.messages.create(chatRequest(ctx, turns, model, { proposals }));
    const usage = { model, ...response.usage };
    if (response.stop_reason === 'refusal') return { text: "…okay I'm gonna not touch that one.", usage, degraded: false, toolCalls: [] };
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
    // A tool call is the end of the turn: nothing is run and no result is sent
    // back, because the tools only propose. The words before it are the reply.
    const toolCalls = proposals
      ? response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use').map((b) => ({ name: b.name, input: b.input }))
      : [];
    // Empty only when the model called a tool and said nothing; the caller has
    // a line for that, which depends on whether the call survives checking.
    return { text: humanizeReply(text) || (toolCalls.length ? '' : '…'), usage, degraded: false, toolCalls };
  } catch (error) {
    // A reply the person is waiting on must not become an error page. Log what
    // kind of failure it was, then answer from the templated fallback.
    if (error instanceof Anthropic.APIConnectionTimeoutError) console.error(`[${label}] model timed out after ${MODEL_TIMEOUT_MS}ms`);
    else if (error instanceof Anthropic.RateLimitError) console.error(`[${label}] rate limited`);
    else if (error instanceof Anthropic.AuthenticationError) console.error(`[${label}] ANTHROPIC_API_KEY rejected`);
    else if (error instanceof Anthropic.APIError) console.error(`[${label}] API error ${error.status}: ${error.message}`);
    else console.error(`[${label}] generation failed`, error);
    return { text: fallback(), usage: null, degraded: true, toolCalls: [] };
  }
};

/**
 * One call that writes a pet's whole bank of push lines, in its voice (see
 * pushLines.ts). Rare -- once per pet until the voice changes or a month passes
 * -- so it is the one place a larger output budget is fine. Null on any failure;
 * the caller keeps its old bank or falls back to stock lines.
 */
export const generatePushLines = async (
  ctx: PetContext,
  turns: Anthropic.MessageParam[],
  instruction: string,
  model: string,
): Promise<{ text: string; usage: unknown } | null> => {
  if (!anthropic) return null;
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      ...(takesEffort(model) ? { output_config: { effort: 'low' as const } } : {}),
      system: systemFor(ctx),
      // Present, and off: the same prefix as a chat reply, so the same cache.
      ...noTools,
      messages: [...turns, { role: 'user', content: instruction }],
    });
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return { text, usage: { model, ...response.usage } };
  } catch (error) {
    console.error('[push-lines] generation failed', error instanceof Anthropic.APIError ? `${error.status}: ${error.message}` : error);
    return null;
  }
};
