import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** A row of mutually exclusive choices (a radio group). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View role="radiogroup" aria-label={label} style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              onPress={() => onChange(option.value)}
              style={[styles.option, selected && styles.selected]}
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
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  option: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.accent },
  text: { fontSize: 15, color: colors.text },
  selectedText: { color: colors.accentText, fontWeight: '600' },
});
