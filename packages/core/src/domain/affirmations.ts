/**
 * Affirmations: now and then, a kind word from the pet, as a notification.
 *
 * Written lines, not a model call, so they cost nothing and can be scheduled
 * on the phone ahead of time (no server, no push token). Every line is in the
 * pet's own voice, about the person, and never about weight, calories or
 * anything they failed to do -- the point is to feel cared for, not nudged.
 *
 * The schedule is pinned to the calendar, not to "now": an affirmation falls on
 * every `EVERY_DAYS`th day, at a time and with a line worked out from that day
 * alone. Re-planning (every app open) therefore lands on the same moments,
 * instead of pushing the next one forward each time -- which, for someone who
 * opens the app daily, would mean it never arrived.
 */

export const AFFIRMATION_LINES: readonly string[] = [
  "Just a reminder: you're doing better than you think.",
  "I'm really glad you're you.",
  "Whatever today looks like, I'm proud of you.",
  'Take a deep breath with me. In, and out.',
  'Small steps still count. Every single one.',
  "You don't have to be perfect to be amazing.",
  "Had some water lately? I'll wait.",
  'Rest is part of getting stronger too.',
  'Be as kind to yourself as you are to me.',
  "It's okay to have a slow day.",
  'I believe in you. Always have.',
  'You make my days better just by being around.',
  'Proud of you for trying, whatever happens.',
  'Think of one good thing from today. I bet there is one.',
  "Your best looks different every day, and that's okay.",
  "Hey. You've got this.",
  'Taking care of yourself is taking care of me too.',
  'Sending you a little hug.',
  "It's okay to ask for help.",
  "You're allowed to be proud of small wins.",
  "Today doesn't have to be perfect to be a good day.",
  'Stretch for a second? Your shoulders will thank you.',
  "I'm cheering for you, even when you can't hear me.",
  'Remember how far you have come.',
];

/** One affirmation on every this-many days. */
export const AFFIRMATION_EVERY_DAYS = 2;
/** Sent between these local hours: well clear of the pet's 10pm-8am quiet time. */
const FIRST_HOUR = 10;
const LAST_HOUR = 19;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlannedAffirmation {
  at: Date;
  body: string;
}

/** A small, stable string hash (FNV-1a), so the same day always plans the same way. */
const hash = (text: string): number => {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
};

/** The day number of a local date, counting from the epoch. */
const localDayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);

/**
 * The next `count` affirmations after `from`, in the device's local time.
 *
 * `seed` (the pet's id) shuffles which line lands on which day, so two pets do
 * not say the same thing on the same day; the order still walks through every
 * line before any repeats.
 */
export const planAffirmations = (from: Date, seed: string, count = 4): PlannedAffirmation[] => {
  const order = [...AFFIRMATION_LINES.keys()].sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
  const planned: PlannedAffirmation[] = [];
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let offset = 0; planned.length < count && offset < count * AFFIRMATION_EVERY_DAYS + AFFIRMATION_EVERY_DAYS; offset += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const number = localDayNumber(day);
    if (number % AFFIRMATION_EVERY_DAYS !== 0) continue;
    const dayHash = hash(`${seed}:${number}`);
    const hour = FIRST_HOUR + (dayHash % (LAST_HOUR - FIRST_HOUR));
    const minute = (dayHash >>> 8) % 60;
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
    if (at.getTime() <= from.getTime()) continue;
    const slot = Math.floor(number / AFFIRMATION_EVERY_DAYS);
    planned.push({ at, body: AFFIRMATION_LINES[order[slot % order.length]!]! });
  }
  return planned;
};
