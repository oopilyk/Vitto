import { Image, View } from 'react-native';
import { CELL, SHEET_COLUMNS, SHEET_ROWS, type PetSheet } from './petSprites';

interface Props {
  sheet: PetSheet;
  /** [row, column] cell of the sheet to show. */
  frame: readonly [number, number];
  size: number;
}

/**
 * One cell of a sprite sheet: a window `size` across with the whole sheet slid
 * behind it. Used both by the animated avatar and by the still previews in pickers.
 */
export function SpriteFrame({ sheet, frame, size }: Props) {
  const scale = size / CELL;
  const [row, column] = frame;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={sheet.source}
        resizeMode="stretch"
        style={{
          width: CELL * SHEET_COLUMNS * scale,
          height: CELL * SHEET_ROWS * scale,
          marginLeft: -column * CELL * scale,
          marginTop: -row * CELL * scale,
        }}
      />
    </View>
  );
}
