import { Pressable, StyleSheet, Switch, Text } from 'react-native';

import { colors, spacing, type } from '@/theme';

import { focusRing } from './focus';
import { ripple } from './press';

/**
 * A setting that is on or off: its label, and the platform's own switch beside it. The whole
 * row toggles it, and screen readers hear one switch named by the label.
 */
export function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      aria-label={label}
      onPress={() => onChange(!value)}
      {...ripple()}
      style={(state) => [styles.row, focusRing(state)]}
    >
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        // The row is the control screen readers reach; the switch only shows its state.
        aria-hidden
        focusable={false}
        trackColor={{ false: colors.muted, true: colors.ink }}
        thumbColor={value ? colors.inkText : colors.surface}
        ios_backgroundColor={colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.xs,
  },
  label: { ...type.body, color: colors.text, flex: 1 },
});
