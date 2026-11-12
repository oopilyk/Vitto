import { Image, StyleSheet, View } from 'react-native';
import { TROPHY_IDS, TROPHY_LABEL, type RoomTheme, type TrophyId } from '@vitto/core';
import { themedStyles } from '../theme';

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

export type ShelfGeometry = {
  centreX: number;
  maxHeight: number;
  plankTops: readonly number[];
  perPlank: number;
  pairWidth: number;
  soloWidth: number;
  pairOffset: number;
};

/**
 * The themed living rooms' wall shelves, measured off each
 * `themes/<theme>/living-day.png` (971x1466; the night art shares the layout,
 * checked row for row) by scanning down the shelf for the planks' bright top
 * edges.
 *
 * These rooms were redrawn with the shelf at least an eighth of the width in
 * from the left edge, like the classic room's, so the usual zoom never crops
 * it. Most shelves carry two display spots a plank -- glass pads, pedestals,
 * acrylic stands, plates, cushions -- so the pairs are centred on those and the
 * feet sit on their tops, 3-4px in. A plank with nothing to stand on comes
 * last, as overflow. Columns and rows are in art pixels.
 */
const W = 971;
const H = 1466;

const shelf = (
  centreX: number,
  pairOffset: number,
  plankTops: number[],
  { maxHeight = 52, pairWidth = 0.065, soloWidth = 0.085 } = {},
): ShelfGeometry => ({
  centreX: centreX / W,
  maxHeight: maxHeight / H,
  plankTops: plankTops.map((row) => row / H),
  perPlank: 2,
  pairWidth,
  soloWidth,
  pairOffset: pairOffset / W,
});

export const THEME_SHELVES: Record<Exclude<RoomTheme, 'classic'>, ShelfGeometry> = {
  // Lit frame (x 122..265), two planks with glass pads at x 163 and 221, pad
  // tops at rows 629 / 714. The pads sit close, so the trophies are narrower.
  space: shelf(192, 29, [632, 717], { maxHeight: 55, pairWidth: 0.049, soloWidth: 0.06 }),
  // Gold frame (x 138..372), pedestals at x 207 and 310 on the top two planks
  // (tops at rows 505 / 588); the bottom plank, row 678, is bare.
  cloud: shelf(258, 52, [508, 591, 682], { pairWidth: 0.07, soloWidth: 0.09 }),
  // Three bare planks (rows 502 / 575 / 648) between posts at x 155 / 325.
  elf: shelf(240, 45, [505, 578, 651], { pairWidth: 0.07, soloWidth: 0.09 }),
  // Shell frame (x 130..350), three planks each with acrylic stands at x 195
  // and 285; the stands' bases are at rows 549 / 629 / 706.
  reef: shelf(240, 45, [552, 632, 709]),
  // Plates at x 190 and 275 on the two enclosed planks (rows 555 / 631); the
  // unit's open top, row 481, is the overflow.
  mountain: shelf(232, 42, [558, 635, 485], { pairWidth: 0.06, soloWidth: 0.08 }),
  // Candy-cane posts (x 135 / 335), glass domes over plates at x 195 and 295
  // (plate tops at rows 552 / 639). A lollipop tops the unit, so two planks:
  // four trophies fill the four domes.
  candy: shelf(245, 50, [556, 643], { maxHeight: 50, pairWidth: 0.06, soloWidth: 0.08 }),
  // Carved posts (x 155 / 345), cushions at x 214 and 300 on the two lower
  // planks (cushion tops at rows 554 / 654). The top plank, row 473, sits under
  // the arch and is the overflow.
  desert: shelf(257, 43, [558, 658, 477], { maxHeight: 58 }),
  // Neon frame (x 132..315), glowing pads at x 175 and 262 on two planks (pad
  // tops at rows 494 / 573).
  cyber: shelf(218, 43, [498, 577], { maxHeight: 50 }),
};

/**
 * Where each trophy sits: filled top plank first, two to a plank, and a plank
 * holding only one centres it rather than leaving it hanging off to the left.
 */
export const shelfSlots = (
  count: number,
  shelf: ShelfGeometry = SHELF,
): { plank: number; centreX: number; width: number }[] =>
  Array.from({ length: count }, (_, index) => {
    const plank = Math.min(Math.floor(index / shelf.perPlank), shelf.plankTops.length - 1);
    const onThisPlank = Math.min(count - plank * shelf.perPlank, shelf.perPlank);
    if (onThisPlank === 1) {
      return { plank, centreX: shelf.centreX, width: shelf.soloWidth };
    }
    const side = index % shelf.perPlank === 0 ? -1 : 1;
    return {
      plank,
      centreX: shelf.centreX + side * shelf.pairOffset,
      width: shelf.pairWidth,
    };
  });

/**
 * Night wash: the room's night sky tone, thin enough that gold still reads as
 * gold. Laid over the trophy's own pixels only (a tinted copy of the art), not
 * as a box over its slot: a box matched the classic room's wall and vanished,
 * but showed as a pale square on any other wall.
 */
const NIGHT_WASH = 'rgb(67, 66, 128)';
const NIGHT_WASH_OPACITY = 0.42;

export function TrophyShelf({
  trophies,
  night,
  shelf = SHELF,
}: {
  trophies: readonly TrophyId[];
  night?: boolean;
  /** Which room's shelf: the classic one unless a theme draws its own. */
  shelf?: ShelfGeometry;
}) {
  if (trophies.length === 0) return null;
  // Shelf order is fixed (top plank first) regardless of earn order, so a shelf
  // with only the shoe still shows it on the top plank rather than a gap above.
  const shown = TROPHY_IDS.filter((id) => trophies.includes(id));
  const slots = shelfSlots(shown.length, shelf);
  return (
    <>
      {shown.map((id, index) => {
        const slot = slots[index];
        const plankTop = shelf.plankTops[slot.plank];
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
                height: `${shelf.maxHeight * 100}%`,
              },
            ]}
          >
            <Image source={TROPHY_ART[id]} style={styles.art} resizeMode="contain" />
            {night ? (
              <Image
                source={TROPHY_ART[id]}
                tintColor={NIGHT_WASH}
                style={[StyleSheet.absoluteFill, styles.art, styles.wash]}
                resizeMode="contain"
              />
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = themedStyles(() => ({
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-end' },
  art: { width: '100%', height: '100%' },
  wash: { opacity: NIGHT_WASH_OPACITY },
}));
