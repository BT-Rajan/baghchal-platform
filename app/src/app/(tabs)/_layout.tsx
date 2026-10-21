import { Tabs } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandBar } from '@/components/brand/Logo';
import { Icon, type IconName } from '@/components/Icon';
import { NotificationBell } from '@/components/NotificationBell';
import { LOGO_TAB } from '@/components/tabs';
import { colors } from '@/theme';

/** From this width the tabs are a sidebar, not a bar stretched along the bottom. */
const SIDEBAR_WIDTH = 900;

/** The tab's icon; on Android the chosen one sits in a pill, as Android's navigation bar does. */
function icon(name: IconName) {
  return function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return Platform.OS === 'android' ? (
      <View style={[styles.pill, focused && styles.pillOn]}>
        <Icon name={name} color={color} />
      </View>
    ) : (
      <Icon name={name} color={color} />
    );
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_WIDTH;
  // On the web the top bar has the logo, the same places and the bell (WebTopBar).
  const web = Platform.OS === 'web';
  const android = Platform.OS === 'android';
  return (
    <Tabs
      {...(web && { tabBar: () => null })}
      screenOptions={{
        ...(web && { headerShown: false }),
        // The first tab's bar carries the logo; the others name the tab (or what it shows).
        header: ({ options, route }) => (
          <TabsHeader title={route.name === LOGO_TAB ? null : (options.title ?? null)} />
        ),
        tabBarActiveTintColor: android ? colors.text : colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: android
          ? { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 }
          : { fontSize: sidebar ? 15 : 13, lineHeight: 18, fontWeight: '600' },
        ...(sidebar
          ? {
              tabBarPosition: 'left',
              tabBarVariant: 'material',
              tabBarLabelPosition: 'beside-icon',
              tabBarActiveBackgroundColor: colors.accentSurface,
              tabBarStyle: {
                width: 220,
                minWidth: 220,
                backgroundColor: colors.surface,
                borderRightColor: colors.border,
                paddingTop: 16,
              },
            }
          : {
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                // Room for the icon and a whole label, above the home indicator (Android's
                // navigation bar is 80 tall).
                height: (android ? 80 : 66) + insets.bottom,
                paddingBottom: insets.bottom,
                ...(android && { paddingTop: 12, elevation: 0 }),
              },
            }),
      }}
    >
      {/* The labels are fixed: a screen may put a longer title in the bar (Me: the username). */}
      <Tabs.Screen
        name="index"
        options={{ title: 'Play', tabBarLabel: 'Play', tabBarIcon: icon('play') }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarLabel: 'Leaderboard',
          tabBarIcon: icon('leaderboard'),
        }}
      />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarLabel: 'Me', tabBarIcon: icon('me') }} />
    </Tabs>
  );
}

/** The brand bar above every tab, reaching up under the status bar. */
function TabsHeader({ title }: { title: string | null }) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.brandInk }}>
      <BrandBar title={title}>
        <NotificationBell />
      </BrandBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Android's navigation bar: a pill behind the chosen tab's icon.
  pill: { width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.accentSurface },
});
