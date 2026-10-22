import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

import { ClawMark, TAGLINE, Wordmark } from './Logo';

/** How long the splash takes to fade into the first screen. */
export const SPLASH_FADE_MS = 300;

/**
 * The apps' opening screen: the claw mark, the name and what the game is, on the brand colour,
 * while ClawPlay starts (the system's own splash shows only the icon). `onShown` fires once it
 * is drawn, so the system splash can give way to it without a flash. It lies over the first
 * screen, which is drawn underneath meanwhile; once `hiding`, it fades away (`fadeMs`) and
 * `onHidden` fires, to take it away.
 */
export function BrandSplash({
  onShown,
  hiding = false,
  onHidden,
  fadeMs = SPLASH_FADE_MS,
}: {
  onShown?: () => void;
  hiding?: boolean;
  onHidden?: () => void;
  fadeMs?: number;
}) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!hiding) return;
    if (fadeMs <= 0) {
      onHidden?.();
      return;
    }
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: fadeMs,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) onHidden?.();
    });
    return () => fade.stop();
  }, [hiding, fadeMs, onHidden, opacity]);
  return (
    <Animated.View
      style={[styles.page, { opacity }]}
      // While it fades, touches reach the screen underneath.
      pointerEvents={hiding ? 'none' : 'auto'}
      aria-hidden={hiding}
      onLayout={onShown}
      role="progressbar"
      aria-label={t('Loading')}
      testID="brand-splash"
    >
      <ClawMark size={112} />
      <Wordmark size={44} onDark />
      <Text style={styles.tagline}>{t(TAGLINE)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.brandInk,
  },
  tagline: { ...type.body, color: colors.brandCream, textAlign: 'center', opacity: 0.85 },
});
