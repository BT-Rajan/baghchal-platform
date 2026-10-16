import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  section: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  hint: { fontSize: 15, color: colors.muted },
});
