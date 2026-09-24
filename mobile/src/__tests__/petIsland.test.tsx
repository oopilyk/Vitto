import fs from 'node:fs';
import path from 'node:path';
import { DECAY_PERIOD_MS, DECAY_PER_DAY, HUNGRY_NUTRITION_THRESHOLD, PET_BREEDS, createPet } from '@vitto/core';
import { sheetByBreed } from '../components/petSprites';
import { buildIslandState, islandSignature, spriteAssetName } from '../services/petIsland';

const mobile = path.join(__dirname, '..', '..');
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const DAY = DECAY_PERIOD_MS;

/** Every sheet a pet can wear: each breed's base plus its evolutions. */
const everySheet = () =>
  PET_BREEDS.flatMap((breed) => {
    const base = sheetByBreed(breed);
    return [base, ...Object.values(base.evolutions ?? {})];
  });

describe('the pet on the Dynamic Island', () => {
  it('hands the Island dates it can animate on its own, not numbers it cannot', () => {
    const pet = { ...createPet('u', 'Blue', 'dog', 'bunny'), nutrition: 60, energy: 80, happiness: 50, health: 90, mood: 'content' as const };
    const state = buildIslandState(pet, NOW);
    const s = (ms: number) => Math.round(ms / 1000);
    // Food is at 60 and falls 18 a day: it was full 40/18 days ago and is empty 60/18 days from now.
    expect(state.nutritionFullAt).toBe(s(NOW - (40 / DECAY_PER_DAY.nutrition) * DAY));
    expect(state.nutritionEmptyAt).toBe(s(NOW + (60 / DECAY_PER_DAY.nutrition) * DAY));
    // So a bar drawn draining full->empty sits at exactly 0.6 right now.
    const at = (state.nutritionEmptyAt - s(NOW)) / (state.nutritionEmptyAt - state.nutritionFullAt);
    expect(at).toBeCloseTo(0.6, 3);
    // It gets hungry when food crosses the threshold, before it gets sleepy.
    expect(state.nextNeed).toBe('hungry');
    expect(state.nextNeedAt).toBe(s(NOW + ((60 - HUNGRY_NUTRITION_THRESHOLD) / DECAY_PER_DAY.nutrition) * DAY));
    expect(state.headline).toBe('Blue is doing fine');
    expect(state.sprite).toBe('bunny');
    expect(state.health).toBeCloseTo(0.9);
  });

  it('stops counting down once the pet already is what it was counting to', () => {
    const hungry = { ...createPet('u', 'Blue', 'dog', 'bunny'), nutrition: 10, energy: 80, happiness: 50, mood: 'hungry' as const };
    const state = buildIslandState(hungry, NOW);
    expect(state.nextNeed).toBeUndefined();
    expect(state.nextNeedAt).toBeUndefined();
    expect(state.headline).toBe('Blue is hungry');
    // An empty bar still gets an ordered window, so the widget never sees to < from.
    const empty = buildIslandState({ ...hungry, nutrition: 0 }, NOW);
    expect(empty.nutritionEmptyAt).toBe(Math.round(NOW / 1000));
    expect(empty.nutritionFullAt).toBeLessThan(empty.nutritionEmptyAt);
  });

  it('says fading over any mood when the pet is dying', () => {
    const dying = { ...createPet('u', 'Blue', 'dog', 'bunny'), health: 5, mood: 'hungry' as const };
    expect(buildIslandState(dying, NOW).headline).toBe('Blue is fading');
  });

  it('only asks for an update when something the Island cannot work out changes', () => {
    const pet = createPet('u', 'Blue', 'dog', 'bunny');
    // Decay alone: the bars slide on their own, so the signature must not move.
    expect(islandSignature({ ...pet, nutrition: 40 })).toBe(islandSignature({ ...pet, nutrition: 70 }));
    expect(islandSignature({ ...pet, mood: 'hungry' })).not.toBe(islandSignature({ ...pet, mood: 'content' }));
    expect(islandSignature({ ...pet, lastEventAt: '2026-09-24T10:00:00Z' })).not.toBe(islandSignature(pet));
    expect(islandSignature({ ...pet, name: 'Miso' })).not.toBe(islandSignature(pet));
  });

  it('has a still frame in the widget for every sheet a pet can wear', () => {
    const sprites = path.join(mobile, 'targets', 'pet-island', 'sprites');
    for (const sheet of everySheet()) {
      const file = path.join(sprites, `${spriteAssetName(sheet.label)}.png`);
      expect(fs.existsSync(file)).toBe(true);
    }
    expect(spriteAssetName('Tabby Cat · Lifter')).toBe('tabbyCatLifter');
  });

  it("cuts the frame the stats screen shows: each sheet's first idle frame", () => {
    // The cutting script cannot import petSprites.ts, so it carries its own
    // table of which cell is idle. This is what stops the two drifting apart.
    const script = fs.readFileSync(path.join(mobile, 'scripts', 'buildIslandSprites.mjs'), 'utf8');
    const table = script.match(/export const IDLE_FRAME = \{([\s\S]*?)\};/)?.[1] ?? '';
    const exceptions = new Map<string, [number, number]>();
    for (const m of table.matchAll(/(\w+): \[(\d+), (\d+)\]/g)) exceptions.set(m[1]!, [Number(m[2]), Number(m[3])]);
    for (const sheet of everySheet()) {
      const [row, column] = sheet.animations.idle[0]!;
      const expected = exceptions.get(spriteAssetName(sheet.label)) ?? [0, 0];
      expect({ sheet: sheet.label, idle: [row, column] }).toEqual({ sheet: sheet.label, idle: expected });
    }
  });

  it('keeps the two copies of the ActivityKit attributes byte-identical', () => {
    // ActivityKit pairs the app's request with the widget's view by this type,
    // and the two targets cannot share a file. Two copies, one truth.
    const a = fs.readFileSync(path.join(mobile, 'targets', 'pet-island', 'PetActivityAttributes.swift'), 'utf8');
    const b = fs.readFileSync(path.join(mobile, 'modules', 'pet-island', 'ios', 'PetActivityAttributes.swift'), 'utf8');
    expect(a).toBe(b);
  });
});
