import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PetBreed } from '@vitto/core';
import { PET_SHEETS } from './petSprites';
import { SpriteFrame } from './SpriteFrame';
import { colors, fonts, themedStyles } from '../theme';

interface Props {
  value: PetBreed | undefined;
  onChange: (breed: PetBreed) => void;
  size?: number;
  /**
   * A breed that cannot be picked right now (switching costs coins the pet does
   * not have): its tile is greyed out, does nothing when pressed, and shows
   * `lockedNote` under its name.
   */
  locked?: (breed: PetBreed) => boolean;
  lockedNote?: string;
  /** The breed the pet is now, marked as such when the selection moves off it. */
  current?: PetBreed;
}

/** Portraits in a wrapping grid — the choice is visual, so show the actual sprite. */
export function BreedPicker({ value, onChange, size = 84, locked, lockedNote, current }: Props) {
  // Which sheets have arrived. Ten sheets of up to 2MB each are requested at
  // once, and until one lands its tile was simply empty — no sprite, no hint
  // that anything was coming. A soft placeholder holds the space instead.
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const markLoaded = (name: string) =>
    setLoaded((current) => (current.has(name) ? current : new Set(current).add(name)));

  return (
    <View style={styles.row}>
      {PET_SHEETS.map((sheet) => {
        const selected = value === sheet.name;
        const ready = loaded.has(sheet.name);
        const isLocked = Boolean(locked?.(sheet.name));
        return (
          <Pressable
            key={sheet.name}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: isLocked }}
            accessibilityLabel={`Choose the ${sheet.label}`}
            disabled={isLocked}
            onPress={() => onChange(sheet.name)}
            style={[styles.option, selected && styles.optionOn, isLocked && styles.optionLocked]}
            testID={`breed-${sheet.name}`}
          >
            <View style={{ width: size, height: size }}>
              {ready ? null : (
                <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]} />
              )}
              <View style={ready ? undefined : styles.hidden}>
                <SpriteFrame
                  sheet={sheet}
                  frame={sheet.animations.idle[0]}
                  size={size}
                  onLoad={() => markLoaded(sheet.name)}
                />
              </View>
            </View>
            <Text style={[styles.label, selected && styles.labelOn]}>{sheet.label}</Text>
            {current === sheet.name && value !== current ? <Text style={styles.note}>Current</Text> : null}
            {isLocked && lockedNote ? <Text style={styles.note}>{lockedNote}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  // A pale disc where the portrait will be — "loading", not "missing".
  placeholder: { position: 'absolute', backgroundColor: colors.sageSoft },
  // Kept mounted so the image actually loads; just not shown until it has.
  hidden: { opacity: 0 },
  option: {
    // Two per row: enough width for the portrait, and it wraps cleanly at 3 or 4.
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    backgroundColor: colors.cardSoft,
  },
  optionOn: { borderColor: colors.coral, backgroundColor: colors.selectedFill },
  label: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 4 },
  labelOn: { color: colors.coralDeep },
  // Greyed right down: the animal is still recognisable, but plainly not on offer.
  optionLocked: { opacity: 0.38 },
  note: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 2 },
}));
