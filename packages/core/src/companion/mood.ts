import type { CompanionEvent, CompanionEventType, CompanionMood, LifeContext, PersonalityTraits } from './types';
import { DAY, HOUR, clamp01 } from './util';

export interface MoodResult {
  mood: CompanionMood;
  intensity: number;
  reason: string;
}

export const ABSENCE_THRESHOLD_MS = 2 * DAY;

const EVENT_MOOD: Partial<Record<CompanionEventType, Array<[CompanionMood, number, string]>>> = {
  WORKOUT_COMPLETED: [['excited', 0.7, 'they just worked out'], ['proud', 0.5, 'they showed up for a workout']],
  STEP_GOAL_REACHED: [['proud', 0.6, 'they hit their step goal']],
  SLEEP_GOAL_REACHED: [['happy', 0.6, 'they slept well']],
  POOR_SLEEP: [['worried', 0.5, 'they slept badly'], ['sleepy', 0.3, 'their bad night is rubbing off on you']],
  HEALTHY_MEAL_LOGGED: [['happy', 0.45, 'they ate something good']],
  USER_OPENED_APP: [['happy', 0.3, 'they came to see you']],
  USER_SENT_MESSAGE: [['happy', 0.25, "you're mid-conversation"]],
  USER_RETURNED_AFTER_ABSENCE: [['excited', 0.8, "they're finally back"], ['happy', 0.5, 'they came back']],
  MEAL_LOGGED: [['happy', 0.5, 'you just ate together']],
  BRAIN_GAME_PLAYED: [['curious', 0.7, 'you just puzzled something out together'], ['happy', 0.4, 'your head feels clear']],
  LEVEL_UP: [['proud', 0.9, 'you just levelled up'], ['excited', 0.7, 'you just levelled up']],
  SLEEP_LOGGED: [['happy', 0.3, 'they got some rest']],
};

/**
 * Mood is RECOMPUTED from the current situation, never incrementally mutated.
 * That keeps it explainable — the reason is its single strongest contributor —
 * and makes it impossible for the pet to get stuck sulking. Negative moods are
 * deliberately mild: they should read as "cares about you", not as a guilt trip.
 */
export const computeMood = (
  input: { traits: PersonalityTraits; lastInteractionAt: number; life?: Pick<LifeContext, 'needs' | 'energy' | 'bond'> },
  recentEvents: readonly CompanionEvent[],
  now: number,
): MoodResult => {
  const scores = new Map<CompanionMood, { score: number; reason: string; top: number }>();
  const add = (mood: CompanionMood, score: number, reason: string) => {
    const current = scores.get(mood) ?? { score: 0, reason, top: -1 };
    current.score += score;
    if (score > current.top) Object.assign(current, { top: score, reason });
    scores.set(mood, current);
  };

  const hoursSince = (now - input.lastInteractionAt) / HOUR;
  const t = input.traits;

  if (hoursSince >= 72) add('lonely', 0.9, "you haven't heard from them in days");
  else if (hoursSince >= 30) add('lonely', 0.6, "it's been over a day since you talked");
  else if (hoursSince >= 8) add('bored', 0.35 + t.playful * 0.2, 'nothing much has happened for a while');

  // The body's needs, stated as the pet's own feelings and never as a failing of theirs.
  const life = input.life;
  if (life) {
    if (life.needs.nutrition <= 25) add('hungry', 0.85, "you haven't eaten in a while and your tummy is loud");
    else if (life.needs.nutrition <= 40) add('hungry', 0.45, "you're getting peckish");
    if (life.needs.mind <= 15) add('bored', 0.5, 'your head feels foggy and you want something to think about');
    if (life.energy < 0.25) add('sleepy', 0.8, "you're running on empty");
    else if (life.energy < 0.4) add('sleepy', 0.45, "you're a bit low on energy");
    // A cooled bond is a quiet hurt, not anger: it reads as missing them.
    if (life.bond === 'sulking') add('lonely', 0.55, "they haven't really been around lately");
    else if (life.bond === 'wary') add('lonely', 0.3, "they've been a bit distant lately");
  }

  // Only the latest of each type counts, so a burst of chat cannot drown out
  // something that actually happened.
  const latestByType = new Map<CompanionEventType, CompanionEvent>();
  for (const event of recentEvents) if (!latestByType.has(event.type)) latestByType.set(event.type, event);
  for (const event of latestByType.values()) {
    const age = (now - event.timestamp) / HOUR;
    const weight = age < 1 ? 1 : age < 6 ? 0.7 : age < 24 ? 0.4 : 0.15;
    for (const [mood, score, reason] of EVENT_MOOD[event.type] ?? []) add(mood, score * weight, reason);
  }

  add('happy', 0.3 + t.affectionate * 0.2, 'things are just fine');
  add('curious', 0.2 + t.curious * 0.35, "you want to know what they're up to");
  if (t.energetic > 0.65 && (life?.energy ?? 0.7) > 0.6) add('excited', 0.3, "you've got energy to burn");
  if (t.calm > 0.7) add('happy', 0.15, "you're generally content");

  let best: [CompanionMood, { score: number; reason: string }] | null = null;
  for (const entry of scores) if (!best || entry[1].score > best[1].score) best = entry;
  const [mood, { score, reason }] = best ?? ['happy', { score: 0.5, reason: 'things are just fine' }];
  return { mood, intensity: Math.round(clamp01(score) * 10) / 10, reason };
};
