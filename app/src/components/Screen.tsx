import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement, type ReactNode } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, type } from '@/theme';

import { BrandHeader } from './brand/Logo';
import { SiteFooter } from './site/SiteFooter';

interface ScreenProps {
  /** The page's heading. Leave it out where the header bar already names the page. */
  title?: string;
  /** The ClawPlay logo above the title (the signed-out screens). */
  brand?: boolean;
  /** Forms sit in the middle of the screen; lists start at the top. */
  align?: 'center' | 'top';
  /** Use the full width of large screens (the game screen puts its board beside its panel). */
  wide?: boolean;
  /** In the apps, pulling the page down asks the server again for everything on it. */
  refreshable?: boolean;
  children: ReactNode;
}

/** A scrolling page with a readable, centred column. */
export function Screen({ refreshable = false, ...page }: ScreenProps) {
  // The crash screen has no data to refresh (and is drawn outside the data layer).
  return refreshable && Platform.OS !== 'web' ? <RefreshablePage {...page} /> : <Page {...page} />;
}

function RefreshablePage(page: Omit<ScreenProps, 'refreshable'>) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <Page
      {...page}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          colors={[colors.accent]}
          tintColor={colors.accent}
        />
      }
    />
  );
}

function Page({
  title,
  align = 'center',
  wide = false,
  brand = false,
  refreshControl,
  children,
}: Omit<ScreenProps, 'refreshable'> & { refreshControl?: ReactElement<RefreshControlProps> }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        testID="page"
        refreshControl={refreshControl}
      >
        {/* The page grows to fill the screen, so the web's footer sits at the bottom. */}
        <View style={[styles.body, align === 'top' && styles.top]}>
          <View role="main" style={[styles.column, wide && styles.wide]}>
            {/* On the web the top bar carries the logo. */}
            {brand && Platform.OS !== 'web' && <BrandHeader />}
            {title !== undefined && (
              <Text role="heading" style={styles.title}>
                {title}
              </Text>
            )}
            {children}
          </View>
        </View>
        {Platform.OS === 'web' && <SiteFooter />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xl },
  body: { flexGrow: 1, justifyContent: 'center' },
  top: { justifyContent: 'flex-start' },
  wide: { maxWidth: 1100 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md },
  title: { ...type.title, color: colors.text, marginBottom: spacing.xs },
});
