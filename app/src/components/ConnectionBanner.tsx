import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useRealtimeStatus } from '@/realtime/RealtimeProvider';
import { colors, spacing } from '@/theme';

/** Says so while live updates are interrupted (the connection is waiting to retry). */
export function ConnectionBanner() {
  if (useRealtimeStatus() !== 'waiting') return null;
  return (
    <View style={styles.banner}>
      <Text role="status" aria-live="polite" style={styles.text}>
        {t('Reconnecting… Live updates are paused.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.text,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: { color: colors.surface, fontSize: 14, textAlign: 'center' },
});
