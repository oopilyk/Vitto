import { Image, StyleSheet, View } from 'react-native';
import { TROPHY_IDS, TROPHY_LABEL, type TrophyId } from '@vitto/core';

/**
 * The living room's empty wall shelf, filled one trophy at a time.
 *
 * Rendered as a child of `EnvironmentBackdrop`, so every number here is a
 * fraction of the ART — the shelf's planks were measured off `main-day.png`
 * and stay under the trophies on any screen, at any scale, under any lift.
 * Never positioned against the screen for that reason.
 *
 * The trophies are cut-out pixel art drawn at a far larger pixel scale than the
 * room. Scaled down to shelf size their chunky outline collapses to roughly one
 * room-pixel, which is what the room's own objects have — so they read as part
 * of the picture rather than pasted on. At night they get the same dark wash the
 * rest of the scene gets, otherwise a full-brightness gold ornament glows like a
 * lamp against the dimmed wall.
 */

const TROPHY_ART: Record<TrophyId, ReturnType<typeof require>> = {
  dumbbell: require('../../assets/trophies/dumbbell.png'),
  shoe: require('../../assets/trophies/shoe.png'),
  drumstick: require('../../assets/trophies/drumstick.png'),
};

/**
 * The shelf, measured off the art (1086x1448): three planks between two posts.
 * `y` is the top surface of each plank, top plank first; the trophy's feet sit
 * on it. `x` is the centre of the span between the posts.
 */
export const SHELF = {
  centreX: 0.261,
  /** Widest a trophy may draw, as a share of art width — inside the posts with a margin. */
  maxWidth: 0.105,
  /** Tallest a trophy may draw — the gap between planks, less headroom. */
  maxHeight: 0.036,
  /**
   * Plank surfaces are at 0.170 / 0.218 / 0.267 of the art's height (rows
   * 246 / 316 / 386 of 1448, measured off the wood). The feet sit 0.004 lower so
   * they overlap the plank's lighter top edge — anchored exactly on the surface
   * they read as hovering a pixel or two above it.
   */
  plankTops: [0.174, 0.222, 0.271] as const,
} as const;

/** Night wash: the room's night sky tone, thin enough that gold still reads as gold. */
const NIGHT_WASH = 'rgba(67, 66, 128, 0.42)';

export function TrophyShelf({ trophies, night }: { trophies: readonly TrophyId[]; night?: boolean }) {
  if (trophies.length === 0) return null;
  // Shelf order is fixed (top plank first) regardless of earn order, so a shelf
  // with only the shoe still shows it on the top plank rather than a gap above.
  const shown = TROPHY_IDS.filter((id) => trophies.includes(id));
  return (
    <>
      {shown.map((id, index) => {
        const plankTop = SHELF.plankTops[Math.min(index, SHELF.plankTops.length - 1)];
        return (
          <View
            key={id}
            accessible
            accessibilityRole="image"
            accessibilityLabel={TROPHY_LABEL[id]}
            style={[
              styles.slot,
              {
                left: `${(SHELF.centreX - SHELF.maxWidth / 2) * 100}%`,
                width: `${SHELF.maxWidth * 100}%`,
                // Anchored by its bottom to the plank's top surface.
                bottom: `${(1 - plankTop) * 100}%`,
                height: `${SHELF.maxHeight * 100}%`,
              },
            ]}
          >
            <Image source={TROPHY_ART[id]} style={styles.art} resizeMode="contain" />
            {night ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-end' },
  art: { width: '100%', height: '100%' },
  wash: { backgroundColor: NIGHT_WASH },
});
