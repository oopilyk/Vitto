import { describe, expect, it } from 'vitest';
import {
  deriveSocialHealth,
  deriveSocialPetStatus,
  SOCIAL_ACTIVITY_POSE,
  SOCIAL_PLACE_LABEL,
  type RecentActivitySignal,
} from './socialPetStatus';
import { createPet } from './pet';
import { getStatusEffects } from './petStatusEffects';

const NOW = new Date('2026-09-07T12:00:00.000Z');

const minutesAgo = (minutes: number): string => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const pet = (over: Partial<ReturnType<typeof createPet>> = {}) => ({
  ...createPet('friend-1', 'Miso', 'cat'),
  health: 80,
  nutrition: 80,
  energy: 80,
  happiness: 80,
  mind: 80,
  ...over,
});

const signal = (type: RecentActivitySignal['type'], occurredAt: string): RecentActivitySignal => ({
  type,
  occurredAt,
});

describe('deriveSocialPetStatus', () => {
  it('reads a very recent event as a live activity', () => {
    const status = deriveSocialPetStatus(pet(), [signal('WORKOUT', minutesAgo(5))], NOW);
    expect(status).toMatchObject({ activity: 'workout', isLive: true, headline: 'Working out' });
  });

  it('falls back to a "earlier" headline once the event is no longer fresh', () => {
    const status = deriveSocialPetStatus(pet(), [signal('WORKOUT', minutesAgo(120))], NOW);
    expect(status.isLive).toBe(false);
    expect(status.recentlyActive).toBe(true);
    expect(status.activity).toBe('workout');
    expect(status.headline).toBe('Worked out earlier');
  });

  it('reads as idle and quiet once nothing happened in the recent window', () => {
    const status = deriveSocialPetStatus(pet(), [signal('MEAL', minutesAgo(60 * 30))], NOW);
    expect(status.activity).toBe('idle');
    expect(status.recentlyActive).toBe(false);
    expect(status.headline).toBe('Quiet lately');
  });

  it('is idle with no headline padding when there are no signals at all', () => {
    const status = deriveSocialPetStatus(pet(), [], NOW);
    expect(status.activity).toBe('idle');
    expect(status.isLive).toBe(false);
    expect(status.recentlyActive).toBe(false);
    expect(status.lastActiveAt).toBeUndefined();
  });

  it('picks the most recent signal regardless of array order', () => {
    const status = deriveSocialPetStatus(
      pet(),
      [signal('MEAL', minutesAgo(500)), signal('STEP_ACTIVITY', minutesAgo(2))],
      NOW,
    );
    expect(status.activity).toBe('walking');
    expect(status.isLive).toBe(true);
  });

  it('never treats a future-dated (malformed/clock-skewed) signal as live', () => {
    const status = deriveSocialPetStatus(pet(), [signal('WORKOUT', minutesAgo(-30))], NOW);
    expect(status.isLive).toBe(false);
    expect(status.recentlyActive).toBe(false);
    expect(status.activity).toBe('idle');
  });

  it('never crashes on an unparsable timestamp, and ignores it like a missing signal', () => {
    const status = deriveSocialPetStatus(pet(), [signal('WORKOUT', 'not-a-date')], NOW);
    expect(status.activity).toBe('idle');
    expect(status.lastActiveAt).toBeUndefined();
  });

  it('surfaces the mood/ailment chip independently of activity', () => {
    const status = deriveSocialPetStatus(pet({ mind: 5 }), [signal('WORKOUT', minutesAgo(5))], NOW);
    expect(status.activity).toBe('workout');
    expect(status.moodLabel).toBe(getStatusEffects(pet({ mind: 5 }))[0]?.label);
    expect(status.moodLabel).toBe('Foggy');
  });

  it('has no mood label when nothing is notable either way', () => {
    // Mid-range stats: no ailment threshold crossed, and not high enough to
    // count as thriving either -- the genuinely neutral case.
    const neutral = pet({ health: 50, nutrition: 50, energy: 50, happiness: 50, mind: 50 });
    const status = deriveSocialPetStatus(neutral, [], NOW);
    expect(status.moodLabel).toBeNull();
  });

  it('reports thriving as the mood label for a pet with every vital high', () => {
    const status = deriveSocialPetStatus(pet(), [], NOW);
    expect(status.moodLabel).toBe('Thriving');
  });

  it('maps every event type with a defined social activity to a headline and (where relevant) a pose', () => {
    const mapped: Array<[RecentActivitySignal['type'], string]> = [
      ['WORKOUT', 'workout'],
      ['MEAL', 'eating'],
      ['STEP_ACTIVITY', 'walking'],
      ['SLEEP', 'sleeping'],
      ['BRAIN_TRAINING', 'training'],
      ['SCREEN_TIME', 'relaxing'],
      ['HYDRATION', 'relaxing'],
      ['MANUAL_ACTIVITY', 'relaxing'],
    ];
    for (const [type, expectedActivity] of mapped) {
      const status = deriveSocialPetStatus(pet(), [signal(type, minutesAgo(5))], NOW);
      expect(status.activity).toBe(expectedActivity);
      expect(status.headline.length).toBeGreaterThan(0);
    }
  });

  it('places the pet in the room its live activity implies', () => {
    const rooms: Array<[RecentActivitySignal['type'], string]> = [
      ['WORKOUT', 'gym'],
      ['MEAL', 'kitchen'],
      ['STEP_ACTIVITY', 'outdoors'],
      ['BRAIN_TRAINING', 'study'],
    ];
    for (const [type, place] of rooms) {
      const status = deriveSocialPetStatus(pet(), [signal(type, minutesAgo(5))], NOW);
      expect(status.place).toBe(place);
      expect(status.placeLabel).toBe(SOCIAL_PLACE_LABEL[place as keyof typeof SOCIAL_PLACE_LABEL]);
    }
  });

  it('sends the pet home once the activity is no longer live', () => {
    const status = deriveSocialPetStatus(pet(), [signal('WORKOUT', minutesAgo(120))], NOW);
    expect(status.isLive).toBe(false);
    expect(status.place).toBe('home');
    expect(status.placeLabel).toBe('At home');
  });

  it('is home with no signals at all', () => {
    expect(deriveSocialPetStatus(pet(), [], NOW).place).toBe('home');
  });

  it('carries a toned health read that always has a value', () => {
    // Healthy: nothing wrong, nothing outstanding.
    const neutral = pet({ health: 50, nutrition: 50, energy: 50, happiness: 50, mind: 50 });
    expect(deriveSocialPetStatus(neutral, [], NOW).health).toEqual({
      level: 'healthy',
      label: 'Healthy',
      tone: 'neutral',
    });
    // Thriving: every vital high.
    expect(deriveSocialPetStatus(pet(), [], NOW).health).toEqual({
      level: 'thriving',
      label: 'Thriving',
      tone: 'good',
    });
    // Dying outranks everything and reads as the worst tone.
    expect(deriveSocialPetStatus(pet({ health: 5 }), [], NOW).health).toEqual({
      level: 'dying',
      label: 'Fading',
      tone: 'bad',
    });
  });

  it('deriveSocialHealth agrees with the status field and with getStatusEffects labels', () => {
    const foggy = pet({ mind: 5 });
    expect(deriveSocialHealth(foggy)).toEqual(deriveSocialPetStatus(foggy, [], NOW).health);
    expect(deriveSocialHealth(foggy).label).toBe(getStatusEffects(foggy)[0]?.label);
  });

  it('only defines a PetAvatar pose for activities with real matching art', () => {
    expect(SOCIAL_ACTIVITY_POSE.workout).toBe('workout');
    expect(SOCIAL_ACTIVITY_POSE.eating).toBe('eating');
    expect(SOCIAL_ACTIVITY_POSE.walking).toBe('exploring');
    expect(SOCIAL_ACTIVITY_POSE.sleeping).toBeUndefined();
    expect(SOCIAL_ACTIVITY_POSE.training).toBeUndefined();
    expect(SOCIAL_ACTIVITY_POSE.relaxing).toBeUndefined();
    expect(SOCIAL_ACTIVITY_POSE.idle).toBeUndefined();
  });
});
