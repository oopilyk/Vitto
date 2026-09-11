/**
 * A moment worth taking over the screen for. Presentation state only — never
 * persisted, never authoritative. The game state has already changed (and been
 * saved) by the time one of these is raised; the celebration only *communicates*
 * that change.
 *
 * A discriminated union so future rewards — evolution, unlocking an environment
 * — slot in as new `kind`s without reworking the trigger or the overlay's
 * mount point. A future milestone treatment (7/30/50/100-day) for `streak` can
 * check `STREAK_MILESTONES.includes(streak)` (careMoment.ts) inside the
 * celebration component itself — the number alone is enough to special-case,
 * with no change needed here.
 */
export type CelebrationEvent =
  | {
      kind: 'levelUp';
      /** Which pet levelled — the on-screen pet; other cared-for pets are fed quietly. */
      petId: string;
      /** The level just reached. Captured at detection time so a forward-projected
       *  (decayed) render of the pet can never change the number shown. */
      level: number;
    }
  | {
      kind: 'streak';
      /** Which pet's streak this is — the on-screen pet. */
      petId: string;
      /** The streak count as of the qualifying day just created (see `createsNewStreakDay`). */
      streak: number;
    };
