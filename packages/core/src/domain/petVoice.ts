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

const FEISTY_OPENERS = ['Oi.', 'Right.', 'Listen.'] as const;
const FEISTY_TAGS = ['Fight me.', 'I said what I said.', 'Try me.'] as const;
const CUTE_TAGS = ['hehe.', 'smol but mighty.', 'ok bye!!'] as const;
// Aimed at the to-do list and never at the person: it orders you about, it does
// not tell you what you are.
const MENACE_OPENERS = ['Oi, dumbass.', 'Listen up.', 'Hey. You.'] as const;
const MENACE_TAGS = ['Move your ass.', 'Now, not later.', "Don't make me say it twice.", 'Chop chop, dammit.'] as const;
const HYPE_OPENERS = ['Ayy.', 'Okay, I see you.', 'Look at us.'] as const;
const HYPE_TAGS = ['Big moves.', "That's what I'm talking about.", 'Main character energy.'] as const;
const SWEET_TAGS = ['So glad you’re here.', 'Thinking of you.', 'Proud of you.'] as const;
/**
 * Savage, on the stock lines: dry, never foul.
 *
 * The swearing the temperament is sold on belongs to the model, which is writing
 * a sentence for one moment and can judge it. This layer restyles fixed strings
 * like "I'm so hungry. Feed me?", and bolting a curse onto those reads as a
 * malfunction rather than a character. See `PERSONALITY_VOICE` in the companion
 * prompts for where the licence actually lives.
 */
const SAVAGE_TAGS = ['Incredible. Truly.', 'Sure. Great plan.', 'Wow. Okay.'] as const;
/** Sulking: cool, not cruel. It still answers; it just is not thrilled you asked. */
const SULKING_OPENERS = ["Oh. You're back.", 'Hm.', 'Fine.'] as const;
const DEVOTED_TAGS = ['Love you.', 'Missed you.', 'Stay a while?'] as const;

// Complaints get their own flourishes. The everyday tags ("Proud of you.", "Big
// moves.") are wrong after "I'm so hungry", which is why an ailing pet used to
// go plain — but being hungry is exactly when a temperament is most audible.
const FEISTY_GRIPES = ['I will riot.', 'Do not test me.', 'This is an outrage.'] as const;
const CUTE_GRIPES = ['pretty please?', "i'm just a baby.", 'tiny emergency.'] as const;
const SWEET_GRIPES = ['Whenever you get a moment.', 'Thank you, really.', 'Only if you can.'] as const;
const SAVAGE_GRIPES = ['No pressure. I will simply perish.', 'Take your time. Really.', "It's fine. I'm fine."] as const;
const HYPE_GRIPE_OPENERS = ['Yo, champ.', 'Boss.', 'Real talk.'] as const;
const HYPE_GRIPES = ['Help a legend out.', "Can't be great on empty.", 'We fix this, we are back.'] as const;

const SENTENCE = /[^.!?…]+[.!?…]*/g;
const sentencesOf = (text: string): string[] => (text.match(SENTENCE) ?? [text]).map((s) => s.trim()).filter(Boolean);

/** Turns the first sentence's full stop into an exclamation, leaving the rest alone. */
const exclaimFirst = (text: string): string => {
  const [first = text, ...rest] = sentencesOf(text);
  return [/[.]$/.test(first) ? `${first.slice(0, -1)}!` : first, ...rest].join(' ');
};

/** First sentence gets an exclamation, and an opener goes in front. */
const energetically = (text: string): string => `${pick(text, ENERGETIC_OPENERS)} ${exclaimFirst(text)}`;

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

/**
 * What each temperament says AROUND the fading line when it is dying, and around
 * the mumble when its head has gone. `[before, after]`, either of which may be
 * empty.
 *
 * The body transform still runs on the line itself — a dying pet really has lost
 * its breath, and that is physical, not a mood. What changes is that the
 * character is no longer erased by it: these parts are deliberately NOT weakened,
 * so the personality punches through the state rather than dissolving into it. A
 * dying menace is furious about dying; a dying sweet is worried about YOU.
 *
 * `menace` swears here, where no other temperament does. It is the one sold on
 * swearing and it is age-gated at adoption, so the fixed-string layer can match
 * what the model does. `savage` still stays clean in this layer (see SAVAGE_TAGS).
 */
const DYING_VOICE: Partial<Record<PetPersonality, readonly [string, string]>> = {
  feisty: ['Oi.', "Don't you dare."],
  cute: ['', "i'm scared…"],
  sweet: ['', "It's okay. I know you're busy."],
  savage: ['Well.', 'Great timing, really.'],
  hype: ['Yo.', 'We were so close, champ.'],
  menace: ['Fuck you, man.', 'Do something.'],
};

/** Same idea, for a head too foggy to hold the thread. Lower case, to match the mumble. */
const FOGGY_VOICE: Partial<Record<PetPersonality, readonly [string, string]>> = {
  feisty: ['', '…what was i even mad about.'],
  cute: ['', '…huh?'],
  sweet: ['', '…sorry, i lost it.'],
  savage: ['', '…anyway.'],
  hype: ['', '…lost the thread, champ.'],
  menace: ['', '…the hell was i saying.'],
};

/** Drops the empty halves, so a temperament can supply one side or neither. */
const wrap = (before: string, middle: string, after: string): string =>
  [before, middle, after].filter(Boolean).join(' ');

const voiceFor = (
  table: Partial<Record<PetPersonality, readonly [string, string]>>,
  personality: PetPersonality | undefined,
): readonly [string, string] => (personality && table[personality]) || ['', ''];

/** A complaint, the way this temperament makes one. The retired four stay plain. */
const complaining = (text: string, personality?: PetPersonality): string => {
  switch (personality) {
    case 'feisty':
      return `${pick(text, FEISTY_OPENERS)} ${text} ${pick(text, FEISTY_GRIPES)}`;
    case 'cute':
      return `${text.replace(/\.$/, '!!')} ${pick(text, CUTE_GRIPES)}`;
    case 'sweet':
      return `${text} ${pick(text, SWEET_GRIPES)}`;
    case 'savage':
      return `${text.replace(/!/g, '.')} ${pick(text, SAVAGE_GRIPES)}`;
    case 'hype':
      return `${pick(text, HYPE_GRIPE_OPENERS)} ${text} ${pick(text, HYPE_GRIPES)}`;
    case 'menace':
      return `${pick(text, MENACE_OPENERS)} ${text.replace(/\?/g, '.')} ${pick(text, MENACE_TAGS)}`;
    default:
      return text;
  }
};

export const petVoice = (line: string, { personality, ailments = [], bond }: VoiceContext = {}): string => {
  const text = line.trim();
  if (!text) return text;
  // Condition shapes the DELIVERY; personality still chooses the words around
  // it. An energetic pet on its last legs is not chipper, but it is still that
  // pet — before this, every temperament said the identical sentence from the
  // moment its head went foggy (day 2 of neglect) until the end, which is most
  // of the time anyone spends in a bad state. See neglect.sim.test.ts.
  if (ailments.includes('dying')) {
    const [before, after] = voiceFor(DYING_VOICE, personality);
    return wrap(before, weakly(text), after);
  }
  if (ailments.includes('foggy')) {
    const [before, after] = voiceFor(FOGGY_VOICE, personality);
    return wrap(before, foggily(text), after);
  }
  // Any other ailment: the line IS the complaint, so it is made the way this
  // pet complains rather than dressed in an everyday flourish. A pet that is
  // cool on you does not perform even that.
  if (ailments.length > 0) return bond === 'sulking' || bond === 'wary' ? text : complaining(text, personality);
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
    // The four offered at adoption.
    case 'feisty':
      return `${pick(text, FEISTY_OPENERS)} ${exclaimFirst(text)} ${pick(text, FEISTY_TAGS)}`;
    case 'cute':
      return `${text.replace(/\.$/, '!!')} ${pick(text, CUTE_TAGS)}`;
    case 'sweet':
      return `${text} ${pick(text, SWEET_TAGS)}`;
    case 'savage':
      return `${text.replace(/!/g, '.')} ${pick(text, SAVAGE_TAGS)}`;
    case 'menace':
      // No question marks: it does not ask.
      return `${pick(text, MENACE_OPENERS)} ${text.replace(/\?/g, '.')} ${pick(text, MENACE_TAGS)}`;
    case 'hype':
      return `${pick(text, HYPE_OPENERS)} ${exclaimFirst(text)} ${pick(text, HYPE_TAGS)}`;
    // A written character has no stock flourishes: its voice is the model's job.
    case 'custom':
      return text;
    // The original set. Still worn by pets adopted before the four above.
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
