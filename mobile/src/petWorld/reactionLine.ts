import { assessCondition, bondFor, petVoice, type HealthEvent, type PetReaction, type PetState } from '@vitto/core';

/**
 * What the pet says about the thing just logged, as the speech bubble over it
 * shows it: said once, in its own voice.
 *
 * A line the model wrote for this exact plate wins; then a food effect's own
 * line ("That was hot!"), the fun part; then the engine's stock line. Said the
 * way this pet would say it (its personality, how it feels about you lately),
 * filtered only through the conditions that change how it can speak at all
 * (fading, foggy): it is a reaction, not a complaint, so hunger does not
 * restyle it.
 */
export const reactionLine = (reaction: PetReaction, pet: PetState, events: readonly HealthEvent[], now = new Date()): string => {
  const line = reaction.authored ? reaction.message : (reaction.effects?.[0]?.reaction ?? reaction.message);
  const ailments = assessCondition(pet).ailments.filter((ailment) => ailment === 'dying' || ailment === 'foggy');
  const bond = bondFor(events as HealthEvent[], now, { adoptedAt: pet.adoptedAt });
  return petVoice(line, { personality: pet.personality, ailments, bond: bond.stage });
};
