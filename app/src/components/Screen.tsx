import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, type } from '@/theme';

import { BrandHeader } from './brand/Logo';

/** A scrolling page with a readable, centred column. */
export function Screen({
  title,
  align = 'center',
  wide = false,
  brand = false,
  children,
}: {
  /** The page's heading. Leave it out where the header bar already names the page. */
  title?: string;
  /** The ClawPlay logo above the title (the signed-out screens). */
  brand?: boolean;
  /** Forms sit in the middle of the screen; lists start at the top. */
  align?: 'center' | 'top';
  /** Use the full width of large screens (the game screen puts its board beside its panel). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, align === 'top' && styles.top]}
        keyboardShouldPersistTaps="handled"
      >
        <View role="main" style={[styles.column, wide && styles.wide]}>
          {brand && <BrandHeader />}
          {title !== undefined && (
            <Text role="heading" style={styles.title}>
              {title}
            </Text>
          )}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.md, paddingBottom: spacing.xl },
  top: { justifyContent: 'flex-start' },
  wide: { maxWidth: 1100 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md },
  title: { ...type.title, color: colors.text, marginBottom: spacing.xs },
});
