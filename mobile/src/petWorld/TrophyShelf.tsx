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
  book: require('../../assets/trophies/book.png'),
};

/**
 * The shelf, measured off the art (1086x1448): three planks between two posts.
 * `y` is the top surface of each plank, top plank first; the trophy's feet sit
 * on it. `x` is the centre of the span between the posts.
 */
export const SHELF = {
  /** Centre of the span between the posts (x 215..351 of 1086, measured off the wood). */
  centreX: 0.261,
  /**
   * Tallest a trophy may draw. The enclosed shelves are ~56px of clear air
   * (plank surfaces at rows 246 / 316 / 386, planks ~14px thick), so 48px keeps
   * a little headroom under the plank above.
   */
  maxHeight: 0.033,
  /**
   * Plank surfaces, as a share of art height, IN FILL ORDER — the two enclosed
   * shelves first, the open top of the unit last.
   *
   * Filling the top first put the trophies in open air above the frame while the
   * shelves below stood empty, which read as balanced on the edge rather than
   * displayed. Rows 316 and 386 of 1448 are the enclosed surfaces; 246 is the
   * top of the unit, kept as overflow for a fifth and sixth trophy.
   *
   * The feet sit 0.004 lower than the measured surface so they overlap the
   * plank's lighter top edge — anchored exactly on it they read as hovering a
   * pixel or two above.
   */
  plankTops: [0.222, 0.271, 0.174] as const,
  /**
   * Two trophies to a plank, because there are three planks and four trophies.
   * Six slots also leaves room for a fifth and sixth without moving anything.
   */
  perPlank: 2,
  /** A pair's slot width, and a lone trophy's — the span is 0.125 of art width. */
  pairWidth: 0.058,
  soloWidth: 0.098,
  /** How far a paired trophy sits from the shelf's centre line. */
  pairOffset: 0.031,
} as const;

/**
 * Where each trophy sits: filled top plank first, two to a plank, and a plank
 * holding only one centres it rather than leaving it hanging off to the left.
 */
export const shelfSlots = (
  count: number,
): { plank: number; centreX: number; width: number }[] =>
  Array.from({ length: count }, (_, index) => {
    const plank = Math.min(Math.floor(index / SHELF.perPlank), SHELF.plankTops.length - 1);
    const onThisPlank = Math.min(count - plank * SHELF.perPlank, SHELF.perPlank);
    if (onThisPlank === 1) {
      return { plank, centreX: SHELF.centreX, width: SHELF.soloWidth };
    }
    const side = index % SHELF.perPlank === 0 ? -1 : 1;
    return {
      plank,
      centreX: SHELF.centreX + side * SHELF.pairOffset,
      width: SHELF.pairWidth,
    };
  });

/** Night wash: the room's night sky tone, thin enough that gold still reads as gold. */
const NIGHT_WASH = 'rgba(67, 66, 128, 0.42)';

export function TrophyShelf({ trophies, night }: { trophies: readonly TrophyId[]; night?: boolean }) {
  if (trophies.length === 0) return null;
  // Shelf order is fixed (top plank first) regardless of earn order, so a shelf
  // with only the shoe still shows it on the top plank rather than a gap above.
  const shown = TROPHY_IDS.filter((id) => trophies.includes(id));
  const slots = shelfSlots(shown.length);
  return (
    <>
      {shown.map((id, index) => {
        const slot = slots[index];
        const plankTop = SHELF.plankTops[slot.plank];
        return (
          <View
            key={id}
            accessible
            accessibilityRole="image"
            accessibilityLabel={TROPHY_LABEL[id]}
            style={[
              styles.slot,
              {
                left: `${(slot.centreX - slot.width / 2) * 100}%`,
                width: `${slot.width * 100}%`,
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
