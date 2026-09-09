import { useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';

/**
 * A scene's full-bleed art, sized so you can actually see the scene.
 *
 * Every environment is drawn 3:4; a phone screen is closer to 9:19.5. Filling
 * that with `resizeMode="cover"` scales to the taller axis and throws away ~38%
 * of the image's width — nearly a fifth off each side, which is most of a room's
 * furniture and both edges of the outdoors art.
 *
 * So the art is fitted to the stage's width instead (see `WIDTH_SCALE`) and
 * anchored to the BOTTOM: the scene is visible essentially edge to edge, and the
 * ground the pet stands on is always in frame. That leaves the top of the screen uncovered, which the stage's
 * own `backgroundColor` paints — each environment sets that to its art's top-edge
 * tone, so the band reads as the sky or wall continuing rather than as a gap.
 * The HUD sits over that band, so the space is not wasted.
 *
 * `fill` opts out of that trade for a scene whose art survives the crop (see the
 * prop), covering the stage edge to edge with no band at all.
 *
 * The height is computed from a measured container width rather than left to a
 * style `aspectRatio`: react-native-web does not constrain the box that way, so
 * the image stretched back to full height and cropped exactly as before — the
 * bug this component exists to fix, silently reintroduced on one platform.
 */

const FALLBACK_ASPECT = 3 / 4;

/**
 * How much wider than the stage the art is drawn, which is the one knob for the
 * band-vs-crop trade-off.
 *
 * 1 fits the width exactly and shows every pixel, but leaves ~38% of a phone
 * screen as flat colour above the art. 1.2 scales the art up and centres it:
 * 10% is lost off each side — the outer edges, where these scenes carry the
 * least — and the art's top edge rises by a fifth, cutting the band to ~26%.
 *
 * Scaling rather than simply shifting the art upward: a shift would uncover a
 * strip along the bottom, and the action row's buttons are separate images on a
 * transparent background, so that strip would show through as flat colour under
 * them.
 */
const WIDTH_SCALE = 1.2;

interface Sized {
  width?: number;
  height?: number;
}

/**
 * The asset's own width/height ratio, so art drawn at a different shape fits its
 * own box instead of being stretched to 3:4.
 *
 * `Image.resolveAssetSource` is **native-only** — react-native-web does not
 * implement it, and calling it there throws and takes the whole screen down with
 * it. So it is feature-detected, with two fallbacks: a source that already
 * carries its dimensions (which is what a bundled require resolves to on web),
 * and finally the ratio every current scene is drawn at.
 */
export const backdropAspectRatio = (source: ImageSourcePropType): number => {
  const resolve = (Image as unknown as { resolveAssetSource?: (s: ImageSourcePropType) => Sized | null })
    .resolveAssetSource;
  const resolved = typeof resolve === 'function' ? resolve(source) : null;
  const direct = typeof source === 'object' && source !== null ? (source as Sized) : null;
  const sized = resolved?.width && resolved?.height ? resolved : direct;
  return sized?.width && sized?.height ? sized.width / sized.height : FALLBACK_ASPECT;
};

/**
 * Art box for a container of this size, anchored to the bottom of the stage.
 *
 * Without `fill` the width alone decides, and how far short of the top the art
 * falls is whatever the art's own ratio gives. With it, the box also grows to at
 * least cover `containerHeight`, so the taller of the two constraints wins and
 * the stage is painted corner to corner. Covering by height on a 9:19.5 screen
 * costs roughly 19% off each side, which is why it is opt-in per scene rather
 * than the default.
 */
export const backdropSize = (
  containerWidth: number,
  aspectRatio: number,
  options?: { containerHeight?: number; fill?: boolean },
) => {
  const fitted = containerWidth * WIDTH_SCALE;
  // Width the art would need for its height to reach the container's.
  const covering = options?.fill ? (options.containerHeight ?? 0) * aspectRatio : 0;
  const width = Math.max(fitted, covering);
  return { width, height: width / aspectRatio, left: (containerWidth - width) / 2 };
};

export function EnvironmentBackdrop({
  source,
  fill,
}: {
  source: ImageSourcePropType;
  /**
   * Cover the whole stage instead of fitting the width, leaving no colour band
   * above the art.
   *
   * Only for scenes composed around their centre — the outdoors art puts the
   * path, the houses and the pet's ground down the middle, so the ~19% lost off
   * each side is hedge and tree canopy. The interiors do not survive it: their
   * furniture lives against the side walls, which is exactly what the crop eats.
   */
  fill?: boolean;
}) {
  const [container, setContainer] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainer((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };
  const { width, height, left } = backdropSize(container.width, backdropAspectRatio(source), {
    containerHeight: container.height,
    fill,
  });

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {container.width > 0 ? (
        <Image
          source={source}
          style={[styles.art, { width, height, left }]}
          // The box is already the image's own ratio, so this only guards against
          // a rounding pixel; it never crops.
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { position: 'absolute', bottom: 0 },
});
