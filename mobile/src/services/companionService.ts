import { companion as ai } from '@vitto/core';
import { supabase } from './supabaseClient';

/**
 * The phone's side of the AI companion.
 *
 * Deliberately thin. Every model call, every usage cap and every write to the
 * companion tables lives in the `companion` edge function; this only describes
 * what happened and what the day looks like, and renders what comes back. There
 * is no API key here and no prompt — a client that could send a prompt would be
 * a free Claude proxy on someone else's bill.
 */
export type CompanionState = ai.CompanionState;
export type CompanionMessage = ai.CompanionMessage;
export type CompanionAccess = ai.CompanionAccess;
export type LifeContext = ai.LifeContext;
export type CompanionEventInput = ai.CompanionEventInput;

/** The account has used today's allowance. Carries what it is allowed, for the UI. */
export class CompanionLimitError extends Error {
  constructor(readonly access: CompanionAccess) {
    super("That's all the chat for today.");
    this.name = 'CompanionLimitError';
  }
}

const invoke = async <T,>(body: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error('Sign in to talk to your pet.');
  const { data, error } = await supabase.functions.invoke('companion', { body });
  if (!error) return data as T;
  // supabase-js hangs the failed Response off `context`; the function's own
  // reason is in its JSON body. Duck-typed, not `instanceof Response`: React
  // Native's fetch polyfill has its own Response class (see mealAnalysis.ts).
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as Response).text === 'function') {
    const raw = await (context as Response).text().catch(() => '');
    try {
      const parsed = JSON.parse(raw) as { error?: string; access?: CompanionAccess };
      if (parsed.error === 'DAILY_LIMIT' && parsed.access) throw new CompanionLimitError(parsed.access);
      if (parsed.error) throw new Error(parsed.error);
    } catch (cause) {
      if (cause instanceof CompanionLimitError || (cause instanceof Error && !(cause instanceof SyntaxError))) throw cause;
    }
  }
  throw error;
};

/**
 * The longest the phone will wait for a reply. The server bounds its own model
 * call well inside this, so hitting it means something upstream stalled — and a
 * chat that says "thinking…" forever is worse than one that admits it gave up.
 */
export const SEND_TIMEOUT_MS = 45_000;

const within = <T,>(work: Promise<T>, ms: number, message: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (cause) => { clearTimeout(timer); reject(cause); },
    );
  });

export const companionService = {
  /** The character, the recent conversation, and what this account may still do today. */
  load: (petId: string, life: LifeContext) =>
    invoke<{ state: CompanionState; messages: CompanionMessage[]; access: CompanionAccess }>({ action: 'state', petId, life }),

  send: (petId: string, life: LifeContext, message: string) =>
    within(
      invoke<{ userMessage: CompanionMessage; reply: CompanionMessage; state: CompanionState; access: CompanionAccess; degraded: boolean }>(
        { action: 'chat', petId, life, message },
      ),
      SEND_TIMEOUT_MS,
      'That is taking too long. Check the conversation in a moment — the reply may still arrive.',
    ),

  /** Something happened in their life. Fire and forget: a failure costs the pet a reaction, nothing else. */
  record: (petId: string, life: LifeContext, event: CompanionEventInput) =>
    invoke<{ state: CompanionState }>({ action: 'event', petId, life, event }),

  /** Ask whether the pet has something to say. Usually it does not, and no model is called. */
  checkIn: (petId: string, life: LifeContext) =>
    invoke<{ message: CompanionMessage | null; trigger: string | null; state: CompanionState }>({ action: 'proactive', petId, life }),

  /**
   * Everything the pet is about to be told, without telling it. Dev accounts
   * only, and no model call — so the prompt can be inspected as often as you
   * like without spending anything.
   */
  debug: (petId: string, life: LifeContext, message?: string) =>
    invoke<CompanionDebug>({ action: 'debug', petId, life, message }),

  /** Forgets everything: a fresh stranger with the current temperament. Dev only. */
  reset: (petId: string, life: LifeContext) => invoke<{ state: CompanionState }>({ action: 'reset', petId, life }),
};

export interface CompanionDebug {
  provider: string;
  state: CompanionState;
  counts: { memories: number; events: number; messages: number };
  usage: { sent: number; proactive: number };
  access: CompanionAccess;
  trigger: { key: string; situation: string; priority: number } | null;
  voice: string | null;
  memories: ai.CompanionMemory[];
  recentEvents: Array<{ type: string; ago: string; metadata: Record<string, unknown> }>;
  patterns: ai.UserPattern[];
  selected: Array<{ id: string; category: string; content: string; score: number }>;
  prompt: { stable: string; dynamic: string; turns: Array<{ role: string; content: string }> };
  tokens: { stable: number; dynamic: number; history: number };
}
