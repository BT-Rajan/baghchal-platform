import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface ButtonProps {
  /** The accessible name; also the visible text unless `label` is given. */
  title: string;
  /** Shorter visible text, when the accessible name needs more context ("Challenge bob"). */
  label?: string;
  /** Smaller, for buttons inside list rows. */
  compact?: boolean;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({
  title,
  label = title,
  compact = false,
  onPress,
  busy = false,
  disabled = false,
  variant = 'primary',
}: ButtonProps) {
  const inactive = busy || disabled;
  const primary = variant === 'primary';
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-busy={busy}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        primary ? styles.primary : styles.secondary,
        (pressed || inactive) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.accentText : colors.accent} />
      ) : (
        <Text style={[styles.text, primary ? styles.primaryText : styles.secondaryText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  compact: { minHeight: 36, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'transparent' },
  dim: { opacity: 0.6 },
  text: { fontSize: 16, fontWeight: '600' },
  primaryText: { color: colors.accentText },
  secondaryText: { color: colors.accent },
});
