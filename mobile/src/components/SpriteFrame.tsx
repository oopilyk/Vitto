import { Image, View } from 'react-native';
import { CELL, SHEET_COLUMNS, SHEET_ROWS, type PetSheet } from './petSprites';

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
  const cell = size * (sheet.artScale ?? 1);
  const scale = cell / CELL;
  const inset = size - cell;
  const columns = sheet.columns ?? SHEET_COLUMNS;
  const rows = sheet.rows ?? SHEET_ROWS;
  const [row, column] = frame;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={sheet.source}
        tintColor={tintColor}
        onLoad={onLoad}
        resizeMode="stretch"
        style={{
          width: CELL * columns * scale,
          height: CELL * rows * scale,
          marginLeft: inset / 2 - column * CELL * scale,
          marginTop: inset - row * CELL * scale,
        }}
      />
    </View>
  );
}
