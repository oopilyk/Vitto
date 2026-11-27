import type { PetPersonality, PetState } from './pet';
import { assessCondition, type PetAilment } from './petCondition';
import type { WeeklyRecap } from './weeklyRecap';
import { formatLocale, t, tn, tx } from '../i18n';

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
    great: t("I feel wonderful. Fluffy, fed and very loved."),
    fine: t("I'm doing okay! Cozy and content."),
    hungry: t("My tummy is rumbling a little."),
    sleepy: t("I'm a sleepy little thing today."),
    starving: t("I'm so hungry it's hard to think about anything else."),
    exhausted: t("I'm worn out and could use a gentle day."),
    sad: t("I've been feeling a bit lonely."),
    foggy: t("My head is fuzzy. A puzzle together would help."),
    dying: t("I'm not doing well at all. Please look after me."),
  },
  hype: {
    great: t("I feel INCREDIBLE. Peak form. Look at me."),
    fine: t("Feeling good and ready to go!"),
    hungry: t("Fuel levels low! Feed the machine!"),
    sleepy: t("Running on low battery, but I'll rally."),
    starving: t("I am RUNNING ON EMPTY. Food. Now. Please."),
    exhausted: t("Even I need a recharge. Wiped out."),
    sad: t("My spark's a bit dim. Come hang out!"),
    foggy: t("Brain's buffering. Let's play something!"),
    dying: t("I'm in real trouble here. I need you."),
  },
  sharp: {
    great: t("I'm in excellent shape. Obviously."),
    fine: t("I'm fine. Don't make it weird."),
    hungry: t("I'm hungry, and I'm keeping track."),
    sleepy: t("Tired. Not that anyone asked."),
    starving: t("Starving. I'd file a complaint if I had thumbs."),
    exhausted: t("Exhausted. This is on you."),
    sad: t("Ignored and unimpressed."),
    foggy: t("My brain is mush. Fix that."),
    dying: t("I am barely hanging on. Not a joke."),
  },
  chill: {
    great: t("Feeling really good. No complaints."),
    fine: t("Doing alright. Steady."),
    hungry: t("Could eat."),
    sleepy: t("Pretty sleepy. It's fine."),
    starving: t("Properly hungry now, not gonna lie."),
    exhausted: t("Running low. Need to recharge."),
    sad: t("Been a bit flat lately."),
    foggy: t("Head's a little cloudy."),
    dying: t("I'm in rough shape. Could use some care."),
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
    0: t("I missed you this week. I'll be right here when you're ready."),
    1: t("You showed up, and that matters to me."),
    2: t("You took good care of us. Thank you."),
    3: t("You were amazing this week. I'm so proud of you."),
  },
  hype: {
    0: t("Quiet week, but comebacks are my FAVORITE. Let's go!"),
    1: t("We got started! Now let's build on it!"),
    2: t("Solid week, teammate! We're cooking!"),
    3: t("WHAT a week! You're unstoppable and I'm your biggest fan!"),
  },
  sharp: {
    0: t("You vanished. I noticed."),
    1: t("A start. Barely. Do better."),
    2: t("Not bad. I've seen worse. From you."),
    3: t("Fine. That was impressive. Don't let it go to your head."),
  },
  chill: {
    0: t("Slow week. Happens. Next one's ours."),
    1: t("Did a little. A little counts."),
    2: t("Good, steady week. Nice work."),
    3: t("Great week. You made it look easy."),
  },
};

/** The week's facts in a sentence, the best of them first. */
const weekFacts = (recap: WeeklyRecap): string => {
  const parts: string[] = [];
  if (recap.workouts > 0) parts.push(tn(recap.workouts, '{count} workout', '{count} workouts'));
  if (recap.mealDays > 0) parts.push(tn(recap.mealDays, '{count} day of meals logged', '{count} days of meals logged'));
  if (recap.stepGoalDays > 0) parts.push(tn(recap.stepGoalDays, 'the step goal once', 'the step goal {count} times'));
  if (recap.mindSessions > 0) parts.push(tn(recap.mindSessions, '{count} mind game', '{count} mind games'));
  if (parts.length === 0) return '';
  const list =
    parts.length === 1
      ? parts[0]!
      : t('{items} and {last}', { items: parts.slice(0, -1).join(tx('between the items of a list', ', ')), last: parts.at(-1)! });
  return list;
};

const WEEK: Record<Voice, (facts: string, recap: WeeklyRecap) => string> = {
  soft: (facts, recap) =>
    facts
      ? recap.records.length > 0
        ? t('This week we did {facts}, and you set a new record! I loved every bit of it.', { facts })
        : t('This week we did {facts}. I loved every bit of it.', { facts })
      : t("It was a quiet week for us. I napped a lot and thought about you."),
  hype: (facts, recap) =>
    facts
      ? recap.records.length > 0
        ? t('This week: {facts}, PLUS a new record! I earned {xp} XP!', { facts, xp: recap.xp.toLocaleString(formatLocale()) })
        : t('This week: {facts}! I earned {xp} XP!', { facts, xp: recap.xp.toLocaleString(formatLocale()) })
      : t("Nothing on the board this week. Blank slate energy!"),
  sharp: (facts, recap) => {
    if (!facts) return t("This week's log is empty. I checked twice.");
    const fewer = recap.workouts < recap.previous.workouts;
    if (recap.records.length > 0) {
      return fewer
        ? t('The tally: {facts}, and a new record, which I will allow. Fewer workouts than last week. I counted.', { facts })
        : t('The tally: {facts}, and a new record, which I will allow.', { facts });
    }
    return fewer ? t('The tally: {facts}. Fewer workouts than last week. I counted.', { facts }) : t('The tally: {facts}.', { facts });
  },
  chill: (facts, recap) =>
    facts
      ? recap.records.length > 0
        ? t('We got in {facts}, plus a new record. Good stuff.', { facts })
        : t('We got in {facts}. Good stuff.', { facts })
      : t("Not much happened this week. That's okay."),
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
