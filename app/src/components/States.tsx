import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

import { Button } from './Button';
import { Notice } from './Notice';

export function Loading({ label = t('Loading') }: { label?: string }) {
  return (
    <View style={styles.loading} role="progressbar" aria-label={label} aria-busy>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.label}>{t('{label}…', { label })}</Text>
    </View>
  );
}

/** What went wrong, and a way to try again. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.error}>
      <Notice tone="error">{describeError(error)}</Notice>
      <Button title={t('Try again')} variant="secondary" compact onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  label: { ...type.caption, color: colors.muted },
  error: { gap: spacing.sm },
});
