import type { HealthEvent, WorkoutMetadata } from './health';
import type { MeasurementSystem } from './macroTargets';

/**
 * Run records: the fastest mile (or kilometre) and the longest run, read off
 * every workout that carries a distance.
 *
 * Like `personalRecords`, derived from the log every time and never stored. A
 * run is any cardio workout with a distance — an Apple Health import brings its
 * own, and a session logged by hand gets one when the lifter types it in. Pace
 * is the whole session's time over its whole distance, so it is an honest
 * average rather than a best split, and it only counts once the run covers at
 * least one full unit: a 400 m sprint does not set a mile record.
 */

export const KM_PER_MILE = 1.609344;

export interface RunRecord {
  /** Distance in the display unit (mi or km). */
  distance: number;
  /** Minutes over the whole run. */
  durationMinutes: number;
  occurredAt: string;
}

export interface PaceRecord extends RunRecord {
  /** Minutes per display unit — the "6:42" number. */
  paceMinutes: number;
}

export interface RunRecords {
  unit: 'mi' | 'km';
  fastest: PaceRecord | null;
  longest: RunRecord | null;
}

const isRun = (metadata: WorkoutMetadata): boolean =>
  metadata.workoutType === 'cardio' && typeof metadata.distanceKm === 'number' && metadata.distanceKm > 0;

export const runRecords = (events: readonly HealthEvent[], system: MeasurementSystem): RunRecords => {
  const unit = system === 'imperial' ? 'mi' : 'km';
  const perKm = unit === 'mi' ? 1 / KM_PER_MILE : 1;
  let fastest: PaceRecord | null = null;
  let longest: RunRecord | null = null;
  for (const event of events) {
    if (event.type !== 'WORKOUT') continue;
    const metadata = event.metadata as WorkoutMetadata;
    if (!isRun(metadata)) continue;
    // Pace divides by the exact distance; only the shown figure is rounded.
    const exact = (metadata.distanceKm as number) * perKm;
    const distance = Math.round(exact * 100) / 100;
    const durationMinutes = Math.max(0, metadata.durationMinutes);
    const run: RunRecord = { distance, durationMinutes, occurredAt: event.occurredAt };
    if (longest === null || distance > longest.distance) longest = run;
    if (exact >= 1 && durationMinutes > 0) {
      const paceMinutes = durationMinutes / exact;
      if (fastest === null || paceMinutes < fastest.paceMinutes) fastest = { ...run, paceMinutes };
    }
  }
  return { unit, fastest, longest };
};

/** "6:42" from 6.7 minutes; seconds always two digits. */
export const formatPace = (paceMinutes: number): string => {
  const total = Math.round(paceMinutes * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
