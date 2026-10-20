import { useQueryClient } from '@tanstack/react-query';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { useContext, useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing, type } from '@/theme';

import { AppBanners, BannersOnScreens } from './AppBanners';
import { BrandHeader } from './brand/Logo';
import { SiteFooter } from './site/SiteFooter';
import { LOGO_TAB } from './tabs';

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
  // A header bar above (a screen's app bar, or the tabs' brand bar) already keeps clear of the
  // status bar, and the tab bar of the home indicator: the page does not add that room again.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const edges: Edge[] = ['left', 'right'];
  if (headerHeight === 0) edges.push('top');
  if (!inTabs) edges.push('bottom');
  // Under a header bar (a screen's app bar, or the tabs' bar), the title goes in the bar, not
  // again in the page.
  // (The home tab's bar carries the logo instead, so its title stays in the page.)
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const logoBar = inTabs && route?.name === LOGO_TAB;
  const titleInBar =
    headerHeight > 0 && title !== undefined && navigation !== undefined && !logoBar;
  useLayoutEffect(() => {
    if (titleInBar) navigation?.setOptions({ title });
  }, [titleInBar, navigation, title]);
  const banners = useContext(BannersOnScreens) && Platform.OS !== 'web';
  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      {banners && <AppBanners />}
      {/* In the apps the page makes room for the keyboard, so the field being typed in shows. */}
      <KeyboardAvoidingView
        style={styles.safe}
        behavior="padding"
        enabled={Platform.OS !== 'web'}
        keyboardVerticalOffset={headerHeight}
      >
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
              {title !== undefined && !titleInBar && (
                <Text role="heading" style={styles.title}>
                  {title}
                </Text>
              )}
              {children}
            </View>
          </View>
          {Platform.OS === 'web' && <SiteFooter />}
        </ScrollView>
      </KeyboardAvoidingView>
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
