import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/auth/session';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';

import { Button } from './Button';

/** For guests: who they are playing as, and the way to keep it. */
export function GuestBanner() {
  const me = useMe();
  if (me.role !== 'guest') return null;
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        {t('Playing as {name}. Make a free account to keep your games.', { name: me.username })}
      </Text>
      <Button
        title={t('Make a free account')}
        variant="bright"
        compact
        onPress={() => router.push('/claim')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.brandInk,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  text: { fontSize: 15, lineHeight: 22, color: colors.brandCream },
});
