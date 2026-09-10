/**
 * A moment worth taking over the screen for. Presentation state only — never
 * persisted, never authoritative. The game state has already changed (and been
 * saved) by the time one of these is raised; the celebration only *communicates*
 * that change.
 *
 * A discriminated union so future rewards — evolution, streak milestones,
 * unlocking an environment — slot in as new `kind`s without reworking the
 * trigger or the overlay's mount point. Only `levelUp` is built today.
 */
export type CelebrationEvent = {
  kind: 'levelUp';
  /** Which pet levelled — the on-screen pet; other cared-for pets are fed quietly. */
  petId: string;
  /** The level just reached. Captured at detection time so a forward-projected
   *  (decayed) render of the pet can never change the number shown. */
  level: number;
};
