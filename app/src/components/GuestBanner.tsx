import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/auth/session';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';

import { Button } from './Button';

/**
 * What holds the account back: for guests, who they are playing as and the way to keep it; for
 * a player under 18, that a parent or guardian has yet to agree.
 */
export function GuestBanner() {
  const me = useMe();
  // Guests under 18 are never asked for a parent (they play only the computer), so this is
  // for accounts.
  if (me.parent_consent === 'pending' && me.role !== 'guest') {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>
          {t(
            'We emailed your parent or guardian. Until they agree you can play the computer and puzzles, but not other people. Ask them to open the link in the email.',
          )}
        </Text>
      </View>
    );
  }
  if (me.role !== 'guest') return null;
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        {t(
          'You are playing as {name}. Make a free account to keep your games, play rated games and challenge friends.',
          { name: me.username },
        )}
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
