import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({
  title,
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
        primary ? styles.primary : styles.secondary,
        (pressed || inactive) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.accentText : colors.accent} />
      ) : (
        <Text style={[styles.text, primary ? styles.primaryText : styles.secondaryText]}>
          {title}
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
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'transparent' },
  dim: { opacity: 0.6 },
  text: { fontSize: 16, fontWeight: '600' },
  primaryText: { color: colors.accentText },
  secondaryText: { color: colors.accent },
});
