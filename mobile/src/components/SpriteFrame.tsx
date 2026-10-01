import { Image, View } from 'react-native';
import { SHEET_COLUMNS, SHEET_ROWS, type PetSheet } from './petSprites';

interface Props {
  /** Fires once the sheet's image has arrived — a caller can show a placeholder until then. */
  onLoad?: () => void;
  sheet: PetSheet;
  /** [row, column] cell of the sheet to show. */
  frame: readonly [number, number];
  size: number;
  /**
   * Repaints every non-transparent pixel this colour, keeping the sprite's own
   * alpha. Used to lay a wash over the pet's silhouette rather than its bounding box.
   */
  tintColor?: string;
}

/** Pixels trimmed from each side of a cell's clip; see SpriteFrame. */
const GUARD = 1;

/**
 * One cell of a sprite sheet: a window `size` across with the whole sheet slid
 * behind it. Used both by the animated avatar and by the still previews in pickers.
 */
export function SpriteFrame({ sheet, frame, size, tintColor, onLoad }: Props) {
  // A sheet drawn large for its cell can be dialled back without redrawing it
  // (see `artScale`): the cell is laid out smaller inside the same window, so
  // the pet shrinks while the window it is measured at stays the same. Pinned to
  // the window's floor and centred horizontally, because the bottom of a cell is
  // the ground the pet stands on — anchoring anywhere else leaves it hovering.
  // Whole pixels throughout. A fractional cell (a 0.72x pet, a 0.78 artScale)
  // puts the cell edges between pixels, and the sheet is smoothed when it is
  // scaled, so a sliver of the neighbouring frame bleeds in along the edge and
  // flickers as the frames change. Rounding the cell makes every offset an exact
  // multiple of it.
  const cell = Math.round(size * (sheet.artScale ?? 1));
  const inset = size - cell;
  const columns = sheet.columns ?? SHEET_COLUMNS;
  const rows = sheet.rows ?? SHEET_ROWS;
  const [row, column] = frame;

  // The clip is the scaled cell, not the whole window: with the cell smaller
  // than the window, clipping at the window lets the neighbouring cells show.
  // It also stops GUARD px short of the cell on every side, so smoothing at a
  // cell's edge (worst while the pet is scaled or bobbing) never reaches the
  // screen. Every cell has empty margin around the art, so nothing is lost.
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: cell - GUARD * 2,
          height: cell - GUARD * 2,
          marginLeft: Math.round(inset / 2) + GUARD,
          marginTop: inset + GUARD,
          overflow: 'hidden',
        }}
      >
        <Image
          source={sheet.source}
          tintColor={tintColor}
          onLoad={onLoad}
          resizeMode="stretch"
          style={{
            width: cell * columns,
            height: cell * rows,
            marginLeft: -column * cell - GUARD,
            marginTop: -row * cell - GUARD,
          }}
        />
      </View>
    </View>
  );
}
