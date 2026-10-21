import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow, spacing, type } from '@/theme';

/** A group of related things, lifted off the page. `tone="accent"` marks the one that matters now. */
export function Card({ children, tone }: { children: ReactNode; tone?: 'accent' }) {
  return <View style={[styles.card, tone === 'accent' && styles.accent]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text role="heading" style={styles.section}>
      {children}
    </Text>
  );
}

/** Quiet text for empty lists and loading. */
export function Hint({ children }: { children: string }) {
  return <Text style={styles.hint}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  accent: { borderStartWidth: 4, borderStartColor: colors.accent },
  section: { ...type.heading, color: colors.text, marginTop: spacing.sm },
  hint: { ...type.small, color: colors.muted },
});
