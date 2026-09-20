import type { CompanionMood, ExtractedMemory, ExtractionResult, PetContext, ToneSignal } from './types';
import { hashString } from './util';

/**
 * A keyless stand-in for the model, so the whole loop (context → reply →
 * extraction → state change) works with no API key: in local development, in
 * tests, and as the graceful answer when the real call fails. Replies are
 * templated from the structured context; extraction is a few regex heuristics.
 *
 * Deterministic: the choice is hashed off the input, never `Math.random`.
 */
const pick = <T,>(seed: string, options: readonly T[]): T => options[hashString(seed) % options.length]!;

const MOOD_OPENERS: Record<CompanionMood, readonly string[]> = {
  happy: ['Ooh nice.', 'Hehe okay.', 'I like today.'],
  excited: ['WAIT.', 'Okay okay okay.', '!!!'],
  sleepy: ['mm. yeah.', '*yawn* go on.', 'sleepy but listening.'],
  bored: ['Finally, something happening.', 'Oh thank goodness, entertainment.', 'Yeah?'],
  proud: ['Look at us.', 'Honestly? Proud.', 'Told you.'],
  lonely: ["Oh hey. You're here.", 'Missed you, not gonna lie.', 'There you are.'],
  curious: ['Wait, tell me more.', 'Huh. Why though?', 'Ooh, go on.'],
  annoyed: ['Hmph. Fine.', 'Sure. Okay.', "I'm listening, technically."],
  worried: ['You okay?', 'Hey. Everything alright?', "I've been wondering about you."],
  hungry: ['*tummy noises* anyway.', 'Hi. Thinking about snacks. Go on.', "I could eat. Unrelated. What's up?"],
};

export const mockReply = (ctx: PetContext, lastUserMessage: string): string => {
  const opener = pick(lastUserMessage + ctx.mood.mood, MOOD_OPENERS[ctx.mood.mood]);
  if (ctx.life.bond === 'sulking') return `Oh. You're back. ${opener}`;
  const question =
    ctx.personality.traits.curious > 0.6 && !lastUserMessage.trim().endsWith('?')
      ? pick(lastUserMessage, [" What's the rest of your day look like?", ' What made you say that?', ' And how do you feel about it?'])
      : '';
  return `${opener}${question}`.trim();
};

export const mockProactive = (situation: string): string => {
  const s = situation.toLowerCase();
  if (s.includes('absent')) return pick(s, ['Um. Hello?? I survived, by the way.', 'Oh so you DO still exist.', 'I counted the days.']);
  if (s.includes('streak')) return "We're on a streak. Don't look at it directly or it'll break.";
  if (s.includes('you remember')) return "Wait, wasn't today the thing? How'd it go?";
  if (s.includes('usually works out')) return "Not to be that pet, but... it's the day. You know the one.";
  if (s.includes('personalrecords')) return "Wait. WAIT. That's a new best?? I felt that one.";
  if (s.includes('workout')) return pick(s, ['Oh you moved! Look at you.', 'Post-workout you is my favourite you.']);
  if (s.includes('step goal')) return 'All those steps?? Where did you even GO.';
  if (s.includes('slept badly')) return "You look tired. Not in a mean way. In a 'please nap' way.";
  if (s.includes('slept')) return "A full night. Who ARE you. I'm so pleased.";
  if (s.includes('levelled up')) return 'I LEVELLED UP. We did that. Mostly you. But also me.';
  if (s.includes('mind game')) return 'My head feels so clear. Again tomorrow?';
  if (s.includes('meal')) return pick(s, ['Ooh. We ate. I approve.', 'Mmm. Same again sometime?']);
  if (s.includes('back after')) return "There you are. I wasn't worried. (I was a bit worried.)";
  return 'Hey. Thinking about you, for the record.';
};

export const mockExtract = (userText: string): ExtractionResult => {
  const memories: ExtractedMemory[] = [];
  const likes = /\bi (?:really )?(?:like|love|enjoy) ([^.,!?]+)/i.exec(userText);
  if (likes && !/^(them|it|that|this|those|these)\b/i.test(likes[1]!.trim())) {
    memories.push({ category: 'preference', content: `User likes ${likes[1]!.trim()}`, importance: 0.6, confidence: 0.8 });
  }
  const wants = /\bi (?:want to|wanna|am trying to|'m trying to) ([^.,!?]+)/i.exec(userText);
  if (wants) memories.push({ category: 'goal', content: `User wants to ${wants[1]!.trim()}`, importance: 0.75, confidence: 0.8 });
  const started = /\bi (?:just |recently )?(?:started|began|took up) ([^.,!?]+)/i.exec(userText);
  if (started) memories.push({ category: 'activity', content: `User recently started ${started[1]!.trim()}`, importance: 0.7, confidence: 0.8 });

  const toneSignals: ToneSignal[] = [];
  if (/\b(lol|haha|lmao)\b/i.test(userText)) toneSignals.push('joking');
  if (/\b(beat|win|faster|better than)\b/i.test(userText)) toneSignals.push('competitive');
  if (/\b(love you|miss you|cute|adorable)\b/i.test(userText)) toneSignals.push('affectionate');
  if (/\?/.test(userText)) toneSignals.push('curious');
  if (/!{2,}/.test(userText)) toneSignals.push('energetic');
  return { memories, toneSignals, suggestedNickname: null };
};
