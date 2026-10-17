import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { describeError } from '@/api/errors';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Notice } from './Notice';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.loading} role="progressbar" aria-label={label} aria-busy>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/** What went wrong, and a way to try again. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.error}>
      <Notice tone="error">{describeError(error)}</Notice>
      <Button title="Try again" variant="secondary" compact onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.lg, alignItems: 'center' },
  error: { gap: spacing.sm },
});
