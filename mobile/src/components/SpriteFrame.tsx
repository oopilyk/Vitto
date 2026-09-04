import { Image, View } from 'react-native';
import { CELL, SHEET_COLUMNS, SHEET_ROWS, type PetSheet } from './petSprites';

interface Props {
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
export function SpriteFrame({ sheet, frame, size, tintColor }: Props) {
  const scale = size / CELL;
  const columns = sheet.columns ?? SHEET_COLUMNS;
  const rows = sheet.rows ?? SHEET_ROWS;
  const [row, column] = frame;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={sheet.source}
        tintColor={tintColor}
        resizeMode="stretch"
        style={{
          width: CELL * columns * scale,
          height: CELL * rows * scale,
          marginLeft: -column * CELL * scale,
          marginTop: -row * CELL * scale,
        }}
      />
    </View>
  );
}
