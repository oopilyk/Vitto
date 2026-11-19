import type { PetPersonality, PetState } from './pet';
import { assessCondition, type PetAilment } from './petCondition';
import type { WeeklyRecap } from './weeklyRecap';

/**
 * The pet's journal: a few lines in its own voice at the top of the week's
 * recap. How it is doing, what it made of the week, and what it thinks of its
 * owner. Written here from the week's numbers and the pet's temperament, not
 * by a model: it is the same on every open, works offline, and costs nothing.
 */
export interface PetJournalEntry {
  /** How the pet itself is. */
  status: string;
  /** What it made of the week. */
  week: string;
  /** What it thinks of its owner, this week. */
  owner: string;
}

/** The temperaments, as the four ways the journal is written. */
type Voice = 'soft' | 'hype' | 'sharp' | 'chill';
const VOICE: Record<PetPersonality, Voice> = {
  cute: 'soft',
  sweet: 'soft',
  supportive: 'soft',
  hype: 'hype',
  energetic: 'hype',
  feisty: 'sharp',
  savage: 'sharp',
  menace: 'sharp',
  competitive: 'sharp',
  chill: 'chill',
  custom: 'chill',
};

type Feeling = 'great' | 'fine' | PetAilment | 'hungry' | 'sleepy';

const STATUS: Record<Voice, Record<Feeling, string>> = {
  soft: {
    great: "I feel wonderful. Fluffy, fed and very loved.",
    fine: "I'm doing okay! Cozy and content.",
    hungry: "My tummy is rumbling a little.",
    sleepy: "I'm a sleepy little thing today.",
    starving: "I'm so hungry it's hard to think about anything else.",
    exhausted: "I'm worn out and could use a gentle day.",
    sad: "I've been feeling a bit lonely.",
    foggy: "My head is fuzzy. A puzzle together would help.",
    dying: "I'm not doing well at all. Please look after me.",
  },
  hype: {
    great: "I feel INCREDIBLE. Peak form. Look at me.",
    fine: "Feeling good and ready to go!",
    hungry: "Fuel levels low! Feed the machine!",
    sleepy: "Running on low battery, but I'll rally.",
    starving: "I am RUNNING ON EMPTY. Food. Now. Please.",
    exhausted: "Even I need a recharge. Wiped out.",
    sad: "My spark's a bit dim. Come hang out!",
    foggy: "Brain's buffering. Let's play something!",
    dying: "I'm in real trouble here. I need you.",
  },
  sharp: {
    great: "I'm in excellent shape. Obviously.",
    fine: "I'm fine. Don't make it weird.",
    hungry: "I'm hungry, and I'm keeping track.",
    sleepy: "Tired. Not that anyone asked.",
    starving: "Starving. I'd file a complaint if I had thumbs.",
    exhausted: "Exhausted. This is on you.",
    sad: "Ignored and unimpressed.",
    foggy: "My brain is mush. Fix that.",
    dying: "I am barely hanging on. Not a joke.",
  },
  chill: {
    great: "Feeling really good. No complaints.",
    fine: "Doing alright. Steady.",
    hungry: "Could eat.",
    sleepy: "Pretty sleepy. It's fine.",
    starving: "Properly hungry now, not gonna lie.",
    exhausted: "Running low. Need to recharge.",
    sad: "Been a bit flat lately.",
    foggy: "Head's a little cloudy.",
    dying: "I'm in rough shape. Could use some care.",
  },
};

/** How the week went, from its numbers: 0 nothing logged, 3 a strong one. */
type Tier = 0 | 1 | 2 | 3;
export const weekTier = (recap: WeeklyRecap): Tier => {
  const active = recap.workouts + recap.mealDays + recap.mindSessions + recap.stepGoalDays;
  if (active === 0) return 0;
  const score =
    Math.min(recap.workouts, 4) / 4 + recap.mealDays / 7 + recap.stepGoalDays / 7 + Math.min(recap.mindSessions, 3) / 3;
  return score >= 2.4 ? 3 : score >= 1.2 ? 2 : 1;
};

const OWNER: Record<Voice, Record<Tier, string>> = {
  soft: {
    0: "I missed you this week. I'll be right here when you're ready.",
    1: "You showed up, and that matters to me.",
    2: "You took good care of us. Thank you.",
    3: "You were amazing this week. I'm so proud of you.",
  },
  hype: {
    0: "Quiet week, but comebacks are my FAVORITE. Let's go!",
    1: "We got started! Now let's build on it!",
    2: "Solid week, teammate! We're cooking!",
    3: "WHAT a week! You're unstoppable and I'm your biggest fan!",
  },
  sharp: {
    0: "You vanished. I noticed.",
    1: "A start. Barely. Do better.",
    2: "Not bad. I've seen worse. From you.",
    3: "Fine. That was impressive. Don't let it go to your head.",
  },
  chill: {
    0: "Slow week. Happens. Next one's ours.",
    1: "Did a little. A little counts.",
    2: "Good, steady week. Nice work.",
    3: "Great week. You made it look easy.",
  },
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The week's facts in a sentence, the best of them first. */
const weekFacts = (recap: WeeklyRecap): string => {
  const parts: string[] = [];
  if (recap.workouts > 0) parts.push(plural(recap.workouts, 'workout'));
  if (recap.mealDays > 0) parts.push(`${plural(recap.mealDays, 'day')} of meals logged`);
  if (recap.stepGoalDays > 0) parts.push(`the step goal ${recap.stepGoalDays === 1 ? 'once' : `${recap.stepGoalDays} times`}`);
  if (recap.mindSessions > 0) parts.push(plural(recap.mindSessions, 'mind game'));
  if (parts.length === 0) return '';
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return list;
};

const WEEK: Record<Voice, (facts: string, recap: WeeklyRecap) => string> = {
  soft: (facts, recap) =>
    facts
      ? `This week we did ${facts}${recap.records.length > 0 ? ', and you set a new record!' : '.'} I loved every bit of it.`
      : "It was a quiet week for us. I napped a lot and thought about you.",
  hype: (facts, recap) =>
    facts
      ? `This week: ${facts}${recap.records.length > 0 ? ', PLUS a new record!' : '!'} I earned ${recap.xp.toLocaleString('en-US')} XP!`
      : "Nothing on the board this week. Blank slate energy!",
  sharp: (facts, recap) =>
    facts
      ? `The tally: ${facts}${recap.records.length > 0 ? ', and a new record, which I will allow' : ''}.${recap.workouts < recap.previous.workouts ? ' Fewer workouts than last week. I counted.' : ''}`
      : "This week's log is empty. I checked twice.",
  chill: (facts, recap) =>
    facts
      ? `We got in ${facts}${recap.records.length > 0 ? ', plus a new record' : ''}. Good stuff.`
      : "Not much happened this week. That's okay.",
};

const feelingOf = (pet: PetState): Feeling => {
  const ailment = assessCondition(pet).primary;
  if (ailment) return ailment;
  if (pet.mood === 'hungry') return 'hungry';
  if (pet.mood === 'sleepy' || pet.mood === 'sluggish') return 'sleepy';
  return pet.mood === 'bright' ? 'great' : 'fine';
};

export const petJournal = (pet: PetState, recap: WeeklyRecap): PetJournalEntry => {
  const voice = VOICE[pet.personality ?? 'chill'] ?? 'chill';
  return {
    status: STATUS[voice][feelingOf(pet)],
    week: WEEK[voice](weekFacts(recap), recap),
    owner: OWNER[voice][weekTier(recap)],
  };
};
