import { Image } from 'react-native';
import { backdropAspectRatio, backdropSize } from '../petWorld/EnvironmentBackdrop';

/**
 * Regression: the backdrop called `Image.resolveAssetSource` unguarded. That is a
 * native-only API — react-native-web has no such function, so on web it threw
 * during render and blanked the entire app rather than degrading to a default.
 */
describe('backdropAspectRatio', () => {
  const resolveAssetSource = Image.resolveAssetSource;
  afterEach(() => {
    (Image as unknown as { resolveAssetSource?: unknown }).resolveAssetSource = resolveAssetSource;
  });

  it('reads the ratio from the resolved asset when the platform can', () => {
    (Image as unknown as { resolveAssetSource: unknown }).resolveAssetSource = () => ({
      width: 1086,
      height: 1448,
    });
    expect(backdropAspectRatio(1 as never)).toBeCloseTo(0.75, 3);
  });

  it('falls back instead of throwing where the API does not exist (web)', () => {
    delete (Image as unknown as { resolveAssetSource?: unknown }).resolveAssetSource;
    expect(() => backdropAspectRatio(1 as never)).not.toThrow();
    expect(backdropAspectRatio(1 as never)).toBeCloseTo(0.75, 3);
  });

  it('uses dimensions carried on the source itself when there is no resolver', () => {
    delete (Image as unknown as { resolveAssetSource?: unknown }).resolveAssetSource;
    expect(backdropAspectRatio({ uri: 'x', width: 200, height: 100 })).toBeCloseTo(2, 3);
  });

  it('falls back when the resolver returns nothing usable', () => {
    (Image as unknown as { resolveAssetSource: unknown }).resolveAssetSource = () => null;
    expect(backdropAspectRatio(1 as never)).toBeCloseTo(0.75, 3);
  });
});

/**
 * The height is computed here rather than via a style `aspectRatio`, which
 * react-native-web does not use to constrain the box — the art stretched back to
 * full height and cropped, which is the very thing this component exists to stop.
 */
describe('backdropSize', () => {
  it('derives the height from the art rather than the container', () => {
    // 3:4 art scaled 1.2x in a 393pt-wide phone: 472 wide, 629 tall, on the bottom.
    const { width, height } = backdropSize(393, 0.75);
    expect(Math.round(width)).toBe(472);
    expect(Math.round(height)).toBe(629);
  });

  it('centres the overscan, so the crop is split evenly between both sides', () => {
    const { width, left } = backdropSize(1000, 0.75);
    expect(left).toBeCloseTo((1000 - width) / 2, 6);
    expect(left).toBeLessThan(0);
  });

  it('covers more of the stage than a plain width fit, which is the point of the scale', () => {
    const scaled = backdropSize(393, 0.75).height;
    expect(scaled).toBeGreaterThan(393 / 0.75);
  });

  it('keeps a wide asset short rather than forcing it to 3:4', () => {
    const { width, height } = backdropSize(400, 2);
    expect(Math.round(height)).toBe(Math.round(width / 2));
  });

  it('is inert before the container has been measured', () => {
    expect(backdropSize(0, 0.75)).toEqual({ width: 0, height: 0, left: 0, bottom: 0 });
  });

  it('fills the stage top to bottom when asked, cropping the sides instead', () => {
    // A 3:4 image on a 393x852 phone: fitting the width leaves a quarter of the
    // screen as bare colour, so `fill` scales it until the height reaches 852.
    const fitted = backdropSize(393, 0.75, { containerHeight: 852 });
    expect(fitted.height).toBeLessThan(852);

    const filled = backdropSize(393, 0.75, { containerHeight: 852, fill: true });
    expect(filled.height).toBeCloseTo(852, 5);
    expect(filled.width).toBeCloseTo(639, 0);
    // Centred, so the crop is split evenly between the two sides.
    expect(filled.left).toBeCloseTo((393 - filled.width) / 2, 5);
    expect(filled.left).toBeLessThan(0);
  });

  it('never shrinks the art below the width fit when filling', () => {
    // A short, wide container: covering its height needs less width than the
    // 1.2x width fit, so the width fit still wins and no scene gets smaller.
    const filled = backdropSize(393, 0.75, { containerHeight: 100, fill: true });
    expect(filled).toEqual(backdropSize(393, 0.75));
  });

  it('ignores a missing container height rather than collapsing', () => {
    expect(backdropSize(393, 0.75, { fill: true })).toEqual(backdropSize(393, 0.75));
  });

  it('raises the art by a share of its own height when lifted', () => {
    const plain = backdropSize(393, 0.75);
    const lifted = backdropSize(393, 0.75, { lift: 0.07 });
    // Same box, just sitting higher: a lift must not resize or re-centre the art.
    expect(lifted.width).toBe(plain.width);
    expect(lifted.height).toBe(plain.height);
    expect(lifted.left).toBe(plain.left);
    expect(lifted.bottom).toBeCloseTo(plain.height * 0.07, 5);
  });

  it('caps a lift so a scene cannot be reframed into a band of floor colour', () => {
    const capped = backdropSize(393, 0.75, { lift: 0.9 });
    expect(capped.bottom).toBeCloseTo(capped.height * 0.15, 5);
  });

  it('lowers the art on a negative lift, capped the same distance as a positive one', () => {
    const dropped = backdropSize(393, 0.75, { lift: -0.05 });
    expect(dropped.bottom).toBeCloseTo(dropped.height * -0.05, 5);
    const cappedDown = backdropSize(393, 0.75, { lift: -0.9 });
    expect(cappedDown.bottom).toBeCloseTo(cappedDown.height * -0.15, 5);
  });

  it('treats a missing or unusable lift as no lift', () => {
    expect(backdropSize(393, 0.75).bottom).toBe(0);
    expect(backdropSize(393, 0.75, { lift: Number.NaN }).bottom).toBe(0);
  });

  it('lifts and fills together, since a filled scene can still be misaligned', () => {
    const both = backdropSize(393, 0.75, { containerHeight: 852, fill: true, lift: 0.05 });
    expect(both.height).toBeCloseTo(852, 5);
    expect(both.bottom).toBeCloseTo(852 * 0.05, 5);
  });
});
