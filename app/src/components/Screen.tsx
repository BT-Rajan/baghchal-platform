import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

/** A scrolling page with a readable, centred column. */
export function Screen({
  title,
  align = 'center',
  children,
}: {
  title?: string;
  /** Forms sit in the middle of the screen; lists start at the top. */
  align?: 'center' | 'top';
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, align === 'top' && styles.top]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
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
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  top: { justifyContent: 'flex-start' },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
});
