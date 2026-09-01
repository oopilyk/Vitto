import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PetBreed } from '@vitto/core';
import { PET_SHEETS } from './petSprites';
import { SpriteFrame } from './SpriteFrame';
import { colors, fonts } from '../theme';

interface Props {
  value: PetBreed | undefined;
  onChange: (breed: PetBreed) => void;
  size?: number;
}

/** Side-by-side portraits — the choice is visual, so show the actual sprite. */
export function BreedPicker({ value, onChange, size = 96 }: Props) {
  return (
    <View style={styles.row}>
      {PET_SHEETS.map((sheet) => {
        const selected = value === sheet.name;
        return (
          <Pressable
            key={sheet.name}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Choose the ${sheet.label}`}
            onPress={() => onChange(sheet.name)}
            style={[styles.option, selected && styles.optionOn]}
          >
            <SpriteFrame sheet={sheet} frame={sheet.animations.idle[0]} size={size} />
            <Text style={[styles.label, selected && styles.labelOn]}>{sheet.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  option: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    backgroundColor: colors.cardSoft,
  },
  optionOn: { borderColor: colors.coral, backgroundColor: '#fbf1ee' },
  label: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 4 },
  labelOn: { color: colors.coralDeep },
});
