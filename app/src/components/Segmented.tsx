import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { focusRing } from './focus';

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** One choice per line, for long labels. */
  vertical?: boolean;
}

/** A row (or column) of mutually exclusive choices (a radio group). */
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
              style={(state) => [styles.option, selected && styles.selected, focusRing(state)]}
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
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 2,
    gap: 2,
  },
  column: { flexDirection: 'column' },
  option: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
  },
  selected: { backgroundColor: colors.accent },
  text: { fontSize: 15, color: colors.text },
  selectedText: { color: colors.accentText, fontWeight: '600' },
});
