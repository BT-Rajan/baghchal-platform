import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

import { focusRing } from './focus';
import { pressedLook, ripple } from './press';

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  /** The chosen option; null while none is (for a choice that must be made, not defaulted). */
  value: T | null;
  onChange: (value: T) => void;
  /** One choice per line, for long labels. */
  vertical?: boolean;
}

/** Mutually exclusive choices (a radio group), drawn as chips; the chosen one is ink. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  vertical = false,
}: SegmentedProps<T>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View role="radiogroup" aria-label={label} style={[styles.row, vertical && styles.column]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              onPress={() => onChange(option.value)}
              {...ripple(selected)}
              style={(state) => [
                styles.option,
                Platform.OS === 'android' && styles.androidTouch,
                vertical && styles.optionVertical,
                selected && styles.selected,
                pressedLook(state.pressed && !selected, styles.pressed),
                focusRing(state),
              ]}
            >
              <Text style={[styles.text, selected && styles.selectedText]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Android's guidelines ask for 48.
  androidTouch: { minWidth: 48, minHeight: 48 },
  field: { gap: spacing.xs },
  label: { ...type.label, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  column: { flexDirection: 'column' },
  option: {
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.subtle,
  },
  optionVertical: {
    borderRadius: radius.md,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  selected: { backgroundColor: colors.ink },
  pressed: { backgroundColor: colors.border },
  text: { ...type.small, color: colors.text, fontWeight: '500' },
  selectedText: { color: colors.inkText, fontWeight: '700' },
});
