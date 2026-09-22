/**
 * A simulation you read, and a few invariants it pins on the way.
 *
 *   SIM=1 npx vitest run src/domain/neglect.sim.test.ts --disable-console-intercept
 *
 * Without SIM=1 it prints nothing, so it costs the normal suite nothing.
 *
 * Thirty days of complete silence, printed day by day: the body, the ailments,
 * the bond, and the same sentence in every temperament's voice. Pure functions
 * only, so it costs nothing and reaches no network.
 */
import { describe, expect, it } from 'vitest';
import { applyTimeDecay } from './decay';
import { AILMENT_MESSAGE, assessCondition } from './petCondition';
import { bondFor } from './bond';
import { createPet } from './pet';
import { petVoice } from './petVoice';
import { computeMood, newCompanionState, describePersonality } from '../companion';
import type { PetPersonality } from './pet';

const VOICES: PetPersonality[] = ['feisty', 'cute', 'sweet', 'savage', 'hype', 'menace'];
const DAY = 86_400_000;
const SHOW = Boolean(process.env.SIM);
const say = (line: string) => { if (SHOW) console.log(line); };
const bar = (n: number) => '█'.repeat(Math.round(n / 10)).padEnd(10, '·');

describe('neglect', () => {
  it('declines', () => {
    const adoptedAt = new Date('2026-08-01T09:00:00Z');
    // One care moment on day 0, then never again.
    const events = [{
      id: 'e1', userId: 'u', type: 'MEAL', occurredAt: adoptedAt.toISOString(), metadata: {},
    }] as never[];
    const born = { ...createPet('u', 'Blue', 'dog', 'bichon', 'sweet'), adoptedAt: adoptedAt.toISOString() };

    const rows: string[] = [];
    let lastStage = '';
    let lastAilments = '';
    for (let day = 0; day <= 30; day += 1) {
      const now = new Date(adoptedAt.getTime() + day * DAY);
      const pet = applyTimeDecay(born, now);
      const condition = assessCondition(pet);
      const bond = bondFor(events, now, { adoptedAt: born.adoptedAt });
      const ailments = condition.ailments.join(',') || '—';
      const mark = bond.stage !== lastStage || ailments !== lastAilments ? '◀' : ' ';
      rows.push(
        `${String(day).padStart(2)}  ` +
        `hp ${bar(pet.health)} ${String(Math.round(pet.health)).padStart(3)}  ` +
        `food ${bar(pet.nutrition)} ${String(Math.round(pet.nutrition)).padStart(3)}  ` +
        `joy ${bar(pet.happiness)} ${String(Math.round(pet.happiness)).padStart(3)}  ` +
        `bond ${String(bond.score).padStart(3)} ${bond.stage.padEnd(8)}  ${ailments.padEnd(28)}${mark}`,
      );
      lastStage = bond.stage;
      lastAilments = ailments;
    }
    say(`\n${'='.repeat(120)}\nTHIRTY DAYS OF SILENCE\n${'='.repeat(120)}`);
    say('day  health          nutrition        happiness        bond            ailments');
    say(rows.join('\n'));

    // What it says, at each point the character changes.
    say(`\n${'='.repeat(120)}\nWHAT IT SAYS — the same pet, every temperament\n${'='.repeat(120)}`);
    for (const day of [0, 3, 6, 10, 14, 21, 30]) {
      const now = new Date(adoptedAt.getTime() + day * DAY);
      const pet = applyTimeDecay(born, now);
      const condition = assessCondition(pet);
      const bond = bondFor(events, now, { adoptedAt: born.adoptedAt });
      const base = condition.primary
        ? AILMENT_MESSAGE[condition.primary]('Blue', { canLogSleep: true })
        : "I'm feeling happy.";
      say(`\n── day ${day} · bond ${bond.stage} (${bond.score}) · ${condition.primary ?? 'well'} · health ${Math.round(pet.health)}`);
      say(`   plain    "${base}"`);
      for (const personality of VOICES) {
        say(`   ${personality.padEnd(8)} "${petVoice(base, { personality, ailments: condition.ailments, bond: bond.stage })}"`);
      }
    }

    // What the AI companion is told.
    say(`\n${'='.repeat(120)}\nWHAT THE AI IS TOLD\n${'='.repeat(120)}`);
    const traits = newCompanionState('u:p', adoptedAt.getTime(), 'sweet').personalityTraits;
    for (const day of [0, 7, 14, 30]) {
      const now = new Date(adoptedAt.getTime() + day * DAY);
      const pet = applyTimeDecay(born, now);
      const condition = assessCondition(pet);
      const bond = bondFor(events, now, { adoptedAt: born.adoptedAt });
      const mood = computeMood(
        {
          traits,
          lastInteractionAt: adoptedAt.getTime(),
          life: {
            bond: bond.stage,
            energy: pet.energy / 100,
            needs: { nutrition: pet.nutrition, energy: pet.energy, happiness: pet.happiness, mind: pet.mind },
          },
        },
        [],
        now.getTime(),
      );
      say(
        `day ${String(day).padStart(2)}  mood ${mood.mood.padEnd(9)} ${mood.intensity.toFixed(1)}  "${mood.reason}"`,
      );
    }
    say(`\ntraits after 30 silent days: ${describePersonality(traits)}`);
    say('(unchanged — nothing happened to change them)\n');

    // Invariants worth keeping, whatever we change about the voice.
    const at = (day: number) => {
      const now = new Date(adoptedAt.getTime() + day * DAY);
      const pet = applyTimeDecay(born, now);
      return { pet, condition: assessCondition(pet), bond: bondFor(events, now, { adoptedAt: born.adoptedAt }) };
    };
    // It never actually dies: health floors and stays there.
    expect(at(11).pet.health).toBe(1);
    expect(at(30).pet.health).toBe(1);
    expect(at(30).condition.primary).toBe('dying');
    // Absence alone takes the bond all the way down, and only absence.
    expect(at(0).bond.stage).toBe('neutral');
    expect(at(9).bond.stage).toBe('sulking');
    expect(at(30).bond.score).toBe(0);
    // Nothing that happens during silence moves the traits.
    expect(traits).toEqual(newCompanionState('u:p', adoptedAt.getTime(), 'sweet').personalityTraits);
  });
});
