import { chromeScaleFor, MAX_CHROME_SCALE, NOTCH_TOP_INSET, STATUS_BAR_TOP_INSET, topInsetFor } from '../petWorld/chromeScale';
import { stageMetrics } from '../petWorld/EnvironmentBackdrop';
import { ROOM_ACTION_HEIGHT, roomActionTop } from '../petWorld/RoomActionSlot';

/** Portrait screens, in points: [name, width, height]. */
const PHONES: [string, number, number][] = [
  ['iPhone SE', 375, 667],
  ['iPhone 13 mini', 375, 812],
  ['iPhone 15 Pro', 393, 852],
  ['iPhone 15 Pro Max', 430, 932],
  ['small Android', 360, 780],
];
const TABLETS: [string, number, number][] = [
  ['iPad mini', 768, 1024],
  ['iPad Air', 820, 1180],
  ['iPad Pro 12.9', 1024, 1366],
];

describe('chromeScaleFor — the pet world chrome on a tablet', () => {
  it.each(PHONES)('leaves every phone exactly as it was (%s)', (_name, width, height) => {
    expect(chromeScaleFor(width, height)).toBe(1);
  });

  it.each(TABLETS)('draws it bigger on a tablet, within the cap (%s)', (_name, width, height) => {
    const scale = chromeScaleFor(width, height);
    expect(scale).toBeGreaterThan(1.15);
    expect(scale).toBeLessThanOrEqual(MAX_CHROME_SCALE);
    // Bounded by the height, so the HUD takes no more of the screen than on the phone.
    expect(scale).toBeLessThanOrEqual(height / 852 + 0.01);
  });

  it('is 1 before anything is measured', () => {
    expect(chromeScaleFor(0, 0)).toBe(1);
    expect(chromeScaleFor(800, 0)).toBe(1);
  });
});

describe('topInsetFor — room for the status bar', () => {
  it('keeps the notch clearance on every notched phone', () => {
    for (const [, width, height] of PHONES.filter(([name]) => name !== 'iPhone SE')) {
      expect(topInsetFor(width, height)).toBe(NOTCH_TOP_INSET);
    }
  });

  it('only clears a status bar where there is no notch', () => {
    expect(topInsetFor(375, 667)).toBe(STATUS_BAR_TOP_INSET);
    for (const [, width, height] of TABLETS) expect(topInsetFor(width, height)).toBe(STATUS_BAR_TOP_INSET);
  });
});

describe('roomActionTop — a room button never sits on the pet', () => {
  const place = (width: number, height: number, hudBottom = 0) => {
    const { petSize, petBottom } = stageMetrics(width, height);
    const petReach = petSize + petBottom;
    const top = roomActionTop({ slotY: 0, slotHeight: height, hudBottom, petReach });
    return { top, bottom: top + ROOM_ACTION_HEIGHT, petTop: height - petReach };
  };

  it('is unchanged on the reference phone: dead centre', () => {
    expect(place(393, 852).top).toBe((852 - ROOM_ACTION_HEIGHT) / 2);
  });

  it.each([...PHONES, ...TABLETS])('clears the pet\'s head (%s)', (_name, width, height) => {
    const { bottom, petTop } = place(width, height);
    expect(bottom).toBeLessThan(petTop);
  });

  it('still drops below the HUD when the HUD reaches further down', () => {
    const { top } = place(375, 667, 320);
    expect(top).toBe(320 + 14);
  });

  it('keeps the old placement until the pet has been measured', () => {
    expect(roomActionTop({ slotY: 0, slotHeight: 667, hudBottom: 0, petReach: 0 })).toBe((667 - ROOM_ACTION_HEIGHT) / 2);
  });
});
