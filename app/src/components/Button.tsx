import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

import { focusRing } from './focus';
import { pressedLook, ripple } from './press';
import { Icon, type IconName } from './Icon';

export interface ButtonProps {
  /** The accessible name; also the visible text unless `label` is given. */
  title: string;
  /** Shorter visible text, when the accessible name needs more context ("Challenge bob"). */
  label?: string;
  /** Smaller, for buttons inside list rows. */
  compact?: boolean;
  /** An icon before the text. */
  icon?: IconName;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /**
   * `primary` is the screen's main action (one per screen, as a rule); `secondary` is any other
   * action. `bright` and `light` are for dark backgrounds (the landing page).
   */
  variant?: 'primary' | 'secondary' | 'bright' | 'light';
}

export function Button({
  title,
  label = title,
  compact = false,
  icon,
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
      {...ripple(variant !== 'secondary')}
      style={(state) => [
        styles.button,
        compact && styles.compact,
        styles[variant],
        pressedLook(state.pressed, styles.pressed),
        inactive && styles.dim,
        focusRing(state),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={TEXT[variant]} />
      ) : (
        <View style={styles.content}>
          {icon !== undefined && <Icon name={icon} color={TEXT[variant]} size={20} />}
          <Text style={[styles.text, compact && styles.compactText, { color: TEXT[variant] }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const TEXT = {
  primary: colors.accentText,
  secondary: colors.text,
  bright: colors.brandInk,
  light: colors.brandCream,
} as const;

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    // Keeps Android's ripple inside the rounded corners.
    overflow: 'hidden',
  },
  // 44 points: the smallest comfortable touch target.
  compact: { minHeight: 44, paddingHorizontal: spacing.md },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  bright: { backgroundColor: colors.brandLight },
  light: { borderWidth: 1, borderColor: colors.brandCream, backgroundColor: 'transparent' },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
  dim: { opacity: 0.55 },
  text: { ...type.body, fontWeight: '700' },
  compactText: { fontSize: 15 },
});
