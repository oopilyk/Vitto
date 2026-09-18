import type { BondStage } from './bond';
import type { PetPersonality } from './pet';
import type { PetAilment } from './petCondition';

/**
 * How the pet says a thing, as opposed to what it says.
 *
 * Every line the pet speaks is decided elsewhere, deterministically: the health
 * engine reacts to a logged moment, `AILMENT_MESSAGE` complains about a stat,
 * a plate's food effects have their own one-liners. This layer restyles that
 * line for the pet's personality and its condition, so one sentence can come
 * out four different ways and a foggy pet sounds foggy saying any of them.
 *
 * Pure and deterministic on purpose. It runs on every render of the HUD, it has
 * to work offline, and the same line must come out the same way twice — so the
 * "random" flourish is picked by hashing the line, never by `Math.random`.
 *
 * Kept charming rather than cruel. A pet whose owner skipped the Mind Gym gets
 * a sleepy-toddler mumble, not an insult; a dying pet trails off, it does not
 * plead. That is the whole reason the degradation is bounded here in code
 * instead of left to a model.
 */
export interface VoiceContext {
  personality?: PetPersonality;
  /** What is wrong with the pet right now, worst first — see `assessCondition`. */
  ailments?: readonly PetAilment[];
  /** How it feels about its owner — see `bondFor`. Neutral when omitted. */
  bond?: BondStage;
}

/** djb2. Stable across platforms, which is all that is asked of it. */
const hash = (text: string): number => {
  let value = 5381;
  for (const character of text) value = ((value << 5) + value + character.charCodeAt(0)) >>> 0;
  return value;
};

/** The same line always gets the same flourish; different lines spread across them. */
const pick = (line: string, options: readonly string[]): string => options[hash(line) % options.length]!;

const COMPETITIVE_TAGS = ['Beat that tomorrow.', 'New record next?', 'Top that.'] as const;
const SUPPORTIVE_TAGS = ['Proud of you.', "We've got this.", 'Nice work.'] as const;
const ENERGETIC_OPENERS = ['Ooh!', 'Yes!', "Let's go!"] as const;
const CHILL_TAGS = ['No rush.', 'All good.', 'Easy does it.'] as const;
/** Sulking: cool, not cruel. It still answers; it just is not thrilled you asked. */
const SULKING_OPENERS = ["Oh. You're back.", 'Hm.', 'Fine.'] as const;
const DEVOTED_TAGS = ['Love you.', 'Missed you.', 'Stay a while?'] as const;

const SENTENCE = /[^.!?…]+[.!?…]*/g;
const sentencesOf = (text: string): string[] => (text.match(SENTENCE) ?? [text]).map((s) => s.trim()).filter(Boolean);

/** First sentence gets an exclamation, and an opener goes in front. */
const energetically = (text: string): string => {
  const [first = text, ...rest] = sentencesOf(text);
  const lifted = /[.]$/.test(first) ? `${first.slice(0, -1)}!` : first;
  return [pick(text, ENERGETIC_OPENERS), lifted, ...rest].join(' ');
};

/** No exclamations, and a settling word at the end. */
const calmly = (text: string): string => `${text.replace(/!/g, '.')} ${pick(text, CHILL_TAGS)}`;

/**
 * Weak: every sentence trails off, only the first keeps its capital, and
 * anything past two sentences is more than it has the breath for.
 */
const weakly = (text: string): string =>
  sentencesOf(text)
    .slice(0, 2)
    .map((sentence, index) => {
      const bare = sentence.replace(/[.!?…]+$/, '').replace(/!/g, '');
      return (index === 0 ? bare : bare.charAt(0).toLowerCase() + bare.slice(1)) + '…';
    })
    .join(' ');

/**
 * Foggy: all lower case, an "uh" after the first word, and a full stop becomes
 * a trailing-off. Questions stay questions — it is confused, not mute.
 */
const foggily = (text: string): string => {
  const lower = text.toLowerCase();
  const [head, ...tail] = lower.split(' ');
  const mumbled = tail.length > 0 ? [head, 'uh…', ...tail].join(' ') : `${head} uh…`;
  return mumbled.replace(/\.$/, '…');
};

export const petVoice = (line: string, { personality, ailments = [], bond }: VoiceContext = {}): string => {
  const text = line.trim();
  if (!text) return text;
  // Condition outranks personality: an energetic pet on its last legs is not
  // chipper, and a foggy one cannot manage a competitive quip.
  if (ailments.includes('dying')) return weakly(text);
  if (ailments.includes('foggy')) return foggily(text);
  // Any other ailment: the line IS the complaint, and a flourish would undercut it.
  if (ailments.length > 0) return text;
  // The relationship, before the temperament. A sulking pet does not perform
  // its personality for someone who has not been around; a wary one is merely
  // plain. Only once things are fine does the personality come through, and a
  // devoted pet gets a word of affection on top of it.
  if (bond === 'sulking') return `${pick(text, SULKING_OPENERS)} ${text}`;
  if (bond === 'wary') return text;
  const styled = withPersonality(text, personality);
  return bond === 'devoted' ? `${styled} ${pick(text, DEVOTED_TAGS)}` : styled;
};

const withPersonality = (text: string, personality?: PetPersonality): string => {
  switch (personality) {
    case 'energetic':
      return energetically(text);
    case 'chill':
      return calmly(text);
    case 'competitive':
      return `${text} ${pick(text, COMPETITIVE_TAGS)}`;
    case 'supportive':
      return `${text} ${pick(text, SUPPORTIVE_TAGS)}`;
    default:
      return text;
  }
};
