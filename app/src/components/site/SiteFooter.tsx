import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

/**
 * The foot of every web page: the copyright, and the terms and privacy policy. (The apps keep
 * these in Settings, as apps do.)
 */
export function SiteFooter({ year = new Date().getFullYear() }: { year?: number }) {
  return (
    <View role="contentinfo" style={styles.footer}>
      <Text style={styles.text}>{t('© {year} ClawPlay. All rights reserved.', { year })}</Text>
      <View style={styles.links}>
        <Link href="/terms" style={styles.link}>
          {t('Terms of service')}
        </Link>
        <Link href="/privacy" style={styles.link}>
          {t('Privacy policy')}
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  text: { ...type.caption, color: colors.muted },
  links: { flexDirection: 'row', gap: spacing.lg },
  // 44 points: the smallest comfortable touch target, the words in its middle.
  link: {
    ...type.caption,
    color: colors.link,
    fontWeight: '600',
    paddingVertical: spacing.sm,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
  },
});
