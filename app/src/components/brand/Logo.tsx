import type { ReactNode } from 'react';
/**
 * The ClawPlay brand: the mark (three tiger claw slashes on an amber badge) and the wordmark
 * ("Claw" in ink, "Play" in amber). The same drawing makes the app icon and the favicon
 * (assets/brand/clawplay-mark.svg).
 */
import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, spacing, tight, type } from '@/theme';

export const BRAND = 'ClawPlay';
export const TAGLINE = 'Bagh Chal · tigers and goats, played live';

const SLASHES = [-14, 3, 20];

export function ClawMark({ size = 48 }: { size?: number }) {
  const id = `mark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <Defs>
        <LinearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.brandLight} />
          <Stop offset="0.55" stopColor={colors.brand} />
          <Stop offset="1" stopColor={colors.brandDark} />
        </LinearGradient>
        <LinearGradient id={`${id}claw`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.tigerStripe} />
          <Stop offset="1" stopColor={colors.brandInk} />
        </LinearGradient>
      </Defs>
      <Rect x={4} y={4} width={92} height={92} rx={24} fill={`url(#${id}bg)`} />
      <Rect
        x={4}
        y={4}
        width={92}
        height={92}
        rx={24}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.25}
        strokeWidth={2}
      />
      <G rotation={-18} origin="50, 50">
        {SLASHES.map((dx) => (
          <G key={dx} x={dx}>
            <Path d="M47 17 Q38 50 50 85 Q47 50 55 18 Q51 15 47 17 Z" fill={`url(#${id}claw)`} />
            <Path
              d="M54.6 20 Q48.6 50 52.6 80"
              stroke="#ffd9a0"
              strokeOpacity={0.45}
              strokeWidth={1.4}
              fill="none"
            />
          </G>
        ))}
      </G>
    </Svg>
  );
}

/** "ClawPlay", with "Play" in amber. Read as one word by screen readers. */
export function Wordmark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <Text
      aria-label={BRAND}
      style={[styles.word, { fontSize: size, letterSpacing: tight(-size / 40) }]}
    >
      <Text style={{ color: onDark ? colors.brandCream : colors.brandInk }}>Claw</Text>
      <Text style={{ color: onDark ? colors.brandLight : colors.brandDeep }}>Play</Text>
    </Text>
  );
}

/** The mark and name side by side, with the tagline under the name when asked. */
export function Brand({
  size = 40,
  tagline = false,
  onDark = false,
}: {
  size?: number;
  tagline?: boolean;
  onDark?: boolean;
}) {
  return (
    <View style={styles.row}>
      <ClawMark size={size} />
      <View>
        <Wordmark size={size * 0.62} onDark={onDark} />
        {tagline && <Text style={styles.tagline}>{TAGLINE}</Text>}
      </View>
    </View>
  );
}

/** The top of the signed-out screens: the brand, large, above the form. */
export function BrandHeader() {
  return (
    <View role="banner" style={styles.header}>
      <Brand size={64} tagline />
    </View>
  );
}

/**
 * The bar above the tabs: the ClawPlay logo on the first tab, the tab's own title on the
 * others (as Android and iOS apps name the place you are in); `children` sit at its right end
 * (the notifications bell).
 */
export function BrandBar({
  title = null,
  children,
}: {
  title?: string | null;
  children?: ReactNode;
}) {
  return (
    <View role="banner" style={styles.bar}>
      {title === null ? (
        <Brand size={30} onDark />
      ) : (
        <Text role="heading" numberOfLines={1} style={styles.barTitle}>
          {title}
        </Text>
      )}
      {children !== undefined && <View style={styles.end}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  word: { fontWeight: '800' },
  tagline: { fontSize: 14, color: colors.muted, marginTop: 2 },
  header: { alignItems: 'center', marginBottom: spacing.md },
  end: { marginLeft: 'auto' },
  // As tall as the logo, so the bar keeps its height from tab to tab.
  barTitle: {
    ...type.heading,
    fontSize: 20,
    lineHeight: 30,
    color: colors.brandCream,
    flexShrink: 1,
  },
  bar: {
    backgroundColor: colors.brandInk,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
