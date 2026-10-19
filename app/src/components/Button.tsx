import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { focusRing } from './focus';

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
  /** ``bright`` and ``light`` are for dark backgrounds (the landing page). */
  variant?: 'primary' | 'secondary' | 'bright' | 'light';
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
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-busy={busy}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      style={(state) => [
        styles.button,
        compact && styles.compact,
        styles[variant],
        (state.pressed || inactive) && styles.dim,
        focusRing(state),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={TEXT[variant]} />
      ) : (
        <Text style={[styles.text, { color: TEXT[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const TEXT = {
  primary: colors.accentText,
  secondary: colors.accent,
  bright: colors.brandInk,
  light: colors.brandCream,
} as const;

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  // 44 points: the smallest comfortable touch target.
  compact: { minHeight: 44, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'transparent' },
  bright: { backgroundColor: colors.brandLight },
  light: { borderWidth: 1, borderColor: colors.brandCream, backgroundColor: 'transparent' },
  dim: { opacity: 0.6 },
  text: { fontSize: 16, fontWeight: '600' },
});
