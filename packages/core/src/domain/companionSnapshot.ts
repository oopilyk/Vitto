import type { HealthEvent, MealMetadata, WorkoutMetadata } from './health';
import { WATER_GOAL_ML, waterMlForDay } from './hydration';
import { calorieEstimate } from './macros';
import { convertWeightValue, type BodyProfile } from './macroTargets';
import type { PetState } from './pet';
import { coinsOf } from './coins';
import { isRemoved } from './removedEvents';
import { calculateQualifyingStreaks } from './streaks';
import { resolvedDays, type TrainingSchedule } from './trainingSchedule';
import { weeklyRecap } from './weeklyRecap';
import { weighIns, weightSummary } from './weightLog';
import type { WorkoutTemplate } from './workoutTemplates';

/**
 * The rest of the app, as short lines for the pet's chat: what they ate today,
 * water, weight and goal, their body profile, recent workouts with their sets,
 * routines and split, the past week, coins and streak freezes. Everything
 * here is their own data, already on their phone; the pet is told to use it
 * when asked and never to recite it unprompted.
 *
 * Plain lines rather than more structured fields: there is a lot of it, it
 * changes as the app grows, and the model reads prose. The server trims and
 * caps them (sanitizeLifeContext) like any other text from the phone.
 */
export const companionSnapshot = (input: {
  pet: PetState;
  events: readonly HealthEvent[];
  profile: BodyProfile;
  stepGoal: number;
  schedule?: TrainingSchedule | null;
  templates?: readonly WorkoutTemplate[];
  now: Date;
}): string[] => {
  const { profile, now } = input;
  const events = input.events.filter((event) => !isRemoved(event));
  const unit = profile.weightUnit;
  const weight = (kg: number) => `${Math.round(convertWeightValue(kg, 'kg', unit) * 10) / 10} ${unit}`;
  const height =
    profile.heightUnit === 'ft'
      ? `${Math.floor(profile.heightCm / 30.48)} ft ${Math.round((profile.heightCm % 30.48) / 2.54)} in`
      : `${Math.round(profile.heightCm)} cm`;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todays = (type: string) =>
    events
      .filter((event) => event.type === type && Date.parse(event.occurredAt) >= dayStart && Date.parse(event.occurredAt) <= now.getTime())
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const lines: string[] = [];

  // Who they are and what they are going for.
  const goal =
    profile.goal === 'maintain'
      ? 'maintain their weight'
      : `${profile.goal} weight${profile.targetWeightKg ? `, to ${weight(profile.targetWeightKg)}` : ''}`;
  lines.push(
    `Profile: ${profile.age}, ${profile.sex}, ${height}, ${weight(profile.weightKg)}, ${profile.activity} activity; goal: ${goal}; trains ${profile.trainingDaysPerWeek} days a week.`,
  );

  // Weight trend.
  const entries = weighIns(events);
  const summary = weightSummary(entries, profile.goal === 'maintain' ? undefined : profile.targetWeightKg, now);
  if (summary.latest) {
    const bits = [`last weigh-in ${weight(summary.latest.kg)}${summary.daysSince ? ` ${summary.daysSince} days ago` : ' today'}`];
    if (summary.change30 !== null) bits.push(`${summary.change30 <= 0 ? 'down' : 'up'} ${weight(Math.abs(summary.change30))} over about a month`);
    if (summary.toGoal !== null) bits.push(`${weight(Math.abs(summary.toGoal))} from their goal`);
    lines.push(`Weight: ${bits.join(', ')}.`);
  }

  // What they ate today, meal by meal.
  const meals = todays('MEAL').slice(-10);
  if (meals.length) {
    lines.push(
      `Eaten today: ${meals
        .map((event) => {
          const analysis = (event.metadata as MealMetadata).analysis;
          const name = analysis?.foodDescription || analysis?.detectedFoods?.slice(0, 3).join(', ') || 'a meal';
          const kcal = calorieEstimate(analysis?.macros);
          const protein = Math.round(analysis?.macros?.proteinGrams ?? 0);
          return `${name.slice(0, 60)} at ${clock(event.occurredAt)}${kcal ? ` (${kcal} kcal, ${protein} g protein)` : ''}`;
        })
        .join('; ')}.`,
    );
  }

  // Water.
  lines.push(`Water today: ${waterMlForDay(events as HealthEvent[], now).toLocaleString('en-US')} of ${WATER_GOAL_ML.toLocaleString('en-US')} ml.`);

  // Recent workouts, newest first, with what they did.
  const workouts = events
    .filter((event) => event.type === 'WORKOUT' && now.getTime() - Date.parse(event.occurredAt) < 14 * 86_400_000)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 4);
  for (const [index, event] of workouts.entries()) {
    const meta = event.metadata as WorkoutMetadata;
    const days = Math.round((dayStart - new Date(new Date(event.occurredAt).toDateString()).getTime()) / 86_400_000);
    const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    const exercises = (meta.exercises ?? [])
      .slice(0, 8)
      .map((exercise) => {
        const done = exercise.sets.filter((set) => set.completed);
        // Sets only on the latest session: the older ones are context, not a log to read out.
        if (index > 0 || done.length === 0) return exercise.name;
        return `${exercise.name} ${done
          .slice(0, 6)
          .map((set) => (set.weight ? `${set.weight}${set.unit ?? unit} x ${set.reps}` : `${set.reps} reps`))
          .join(', ')}`;
      })
      .join('; ');
    lines.push(
      `Workout ${when}: ${meta.name || meta.workoutType}, ${Math.round(meta.durationMinutes)} min${meta.distanceKm ? `, ${Math.round(meta.distanceKm * 10) / 10} km` : ''}${exercises ? ` — ${exercises}` : ''}.`,
    );
  }

  // Their routines and split.
  const templates = input.templates ?? [];
  if (templates.length) {
    lines.push(
      `Saved routines: ${templates
        .slice(0, 10)
        .map((template) => `${template.name} (${template.exercises.slice(0, 8).map((exercise) => exercise.name).join(', ')})`)
        .join('; ')}.`,
    );
  }
  if (input.schedule) {
    const days = resolvedDays(input.schedule, templates);
    if (days.length) {
      lines.push(
        `Their split, in order: ${days
          .map((day) => (day.kind === 'rest' ? 'Rest' : templates.find((template) => template.id === day.templateId)?.name ?? 'Routine'))
          .join(', ')}.`,
      );
    }
  }

  // The past seven days.
  const week = weeklyRecap(events as HealthEvent[], profile, input.stepGoal, now);
  const weekBits = [`${week.workouts} workout${week.workouts === 1 ? '' : 's'}`];
  if (week.averageCalories !== null) weekBits.push(`about ${Math.round(week.averageCalories)} kcal a day on ${week.mealDays} logged days`);
  if (week.averageSteps !== null) weekBits.push(`about ${Math.round(week.averageSteps).toLocaleString('en-US')} steps a day`);
  weekBits.push(`water goal hit ${week.waterDays} of 7 days`, `${week.mindSessions} mind games`);
  if (week.records.length) weekBits.push(`new records on ${week.records.join(', ')}`);
  lines.push(`Last 7 days: ${weekBits.join(', ')}.`);

  // Streak and coins.
  const streak = calculateQualifyingStreaks(events as HealthEvent[], now);
  lines.push(
    `Streak: ${streak.currentStreak} days (best ${streak.longestStreak}), ${streak.freezes} streak freeze${streak.freezes === 1 ? '' : 's'}; coins: ${coinsOf(input.pet)}.`,
  );

  return lines;
};
