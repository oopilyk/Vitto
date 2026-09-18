import type { HealthEvent } from './health';

/**
 * How the pet feels about its owner right now — the relationship, as opposed
 * to its temperament (`personality`) or its body (the evolved build).
 *
 * Derived from the event log on every read and never stored, like every other
 * stateful thing about the pet's condition (ailments, food effects, streaks).
 * That is what makes it safe: it survives a reload, cannot drift from what
 * actually happened, and needs no write that could conflict with a partner's.
 *
 * The score walks the last `BOND_WINDOW_DAYS`: a day with any care moment warms
 * it, a silent day cools it, and recent days weigh more than old ones. Two
 * things are deliberate. Today is only ever counted in the pet's favour — an
 * owner who has not logged yet this morning is not being neglectful. And a
 * young relationship is pulled toward neutral, so devotion is earned over a
 * couple of weeks rather than handed out on day one.
 *
 * The bottom of the scale is sulking, not hostility, and it is a rolling window,
 * so a fortnight of showing up always wins the pet back. Neglect here means
 * absence, never the content of what was logged.
 */
export type BondStage = 'devoted' | 'warm' | 'neutral' | 'wary' | 'sulking';

export interface Bond {
  /** 0 (a fortnight of silence) to 100 (a fortnight of daily care). 50 is neutral. */
  score: number;
  stage: BondStage;
  /** Whole days since the last care moment; 0 when there was one today. */
  silentDays: number;
}

export const BOND_WINDOW_DAYS = 14;

const STAGE_FLOOR: readonly (readonly [number, BondStage])[] = [
  [80, 'devoted'], [60, 'warm'], [40, 'neutral'], [20, 'wary'], [0, 'sulking'],
];

export const bondStage = (score: number): BondStage =>
  STAGE_FLOOR.find(([floor]) => score >= floor)?.[1] ?? 'sulking';

const DAY_MS = 86_400_000;
const localDayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayStart = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const bondFor = (
  events: readonly HealthEvent[],
  now: Date = new Date(),
  options: { adoptedAt?: string } = {},
): Bond => {
  const caredDays = new Set<string>();
  let latest = -Infinity;
  for (const event of events) {
    const at = new Date(event.occurredAt);
    if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) continue;
    caredDays.add(localDayKey(at));
    if (at.getTime() > latest) latest = at.getTime();
  }

  const today = dayStart(now);
  // How much history there is to judge on: days since adoption, capped at the window.
  const adopted = options.adoptedAt ? dayStart(new Date(options.adoptedAt)) : null;
  const knownDays = adopted && !Number.isNaN(adopted.getTime())
    ? Math.max(1, Math.min(BOND_WINDOW_DAYS, Math.floor((today.getTime() - adopted.getTime()) / DAY_MS) + 1))
    : BOND_WINDOW_DAYS;

  // Weighted vote over the window: today counts only if cared for, then each
  // earlier day counts for or against, weight falling off with age.
  let signed = 0;
  let possible = 0;
  for (let daysAgo = 0; daysAgo < knownDays; daysAgo += 1) {
    const weight = (BOND_WINDOW_DAYS - daysAgo) / BOND_WINDOW_DAYS;
    const key = localDayKey(new Date(today.getTime() - daysAgo * DAY_MS));
    const cared = caredDays.has(key);
    if (daysAgo === 0) {
      if (cared) { signed += weight; possible += weight; }
      continue;
    }
    possible += weight;
    signed += cared ? weight : -weight;
  }
  // Pulled toward neutral while the relationship is young.
  const confidence = knownDays / BOND_WINDOW_DAYS;
  const score = possible === 0
    ? 50
    : Math.round(Math.min(100, Math.max(0, 50 + 50 * (signed / possible) * confidence)));

  const silentDays = latest === -Infinity
    ? knownDays
    : Math.max(0, Math.floor((today.getTime() - dayStart(new Date(latest)).getTime()) / DAY_MS));

  return { score, stage: bondStage(score), silentDays };
};
