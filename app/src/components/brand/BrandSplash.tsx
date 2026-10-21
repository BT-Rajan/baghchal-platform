import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

import { ClawMark, TAGLINE, Wordmark } from './Logo';

/**
 * The apps' opening screen: the claw mark, the name and what the game is, on the brand colour,
 * while ClawPlay starts (the system's own splash shows only the icon). `onShown` fires once it
 * is drawn, so the system splash can give way to it without a flash.
 */
export function BrandSplash({ onShown }: { onShown?: () => void }) {
  return (
    <View
      style={styles.page}
      onLayout={onShown}
      role="progressbar"
      aria-label={t('Loading')}
      testID="brand-splash"
    >
      <ClawMark size={112} />
      <Wordmark size={44} onDark />
      <Text style={styles.tagline}>{t(TAGLINE)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.brandInk,
  },
  tagline: { ...type.body, color: colors.brandCream, textAlign: 'center', opacity: 0.85 },
});
