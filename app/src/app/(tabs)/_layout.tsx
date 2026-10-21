import { Tabs } from 'expo-router';
import {
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ColorValue,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandBar } from '@/components/brand/Logo';
import { Icon, type IconName } from '@/components/Icon';
import { NotificationBell } from '@/components/NotificationBell';
import { LOGO_TAB } from '@/components/tabs';
import { t } from '@/i18n';
import { colors, spaced, spacing, type } from '@/theme';
import { InLanguage, useLanguage } from '@/i18n/LanguageRoot';

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

/** How many tabs there are (Play, Leaderboard, Me). */
const TAB_COUNT = 3;

/**
 * The tab's name. No fixed line height, so it grows with the player's text size, but only so
 * far (the bar has to keep its icons); never spaced in Arabic, whose letters join. iOS also
 * hears where the tab is, as it does for its own tab bars.
 */
function label(text: string, position: number, style: TextStyle) {
  return {
    tabBarLabel: function TabBarLabel({ color }: { color: ColorValue }) {
      return (
        <Text style={[style, { color }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
          {text}
        </Text>
      );
    },
    ...(Platform.OS === 'ios' && {
      tabBarAccessibilityLabel: t('{label}, tab, {position} of {count}', {
        label: text,
        position,
        count: TAB_COUNT,
      }),
    }),
  };
}

export default function TabsLayout() {
  useLanguage(); // the tab labels and titles, in a new language
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_WIDTH;
  // On the web the top bar has the logo, the same places and the bell (WebTopBar).
  const web = Platform.OS === 'web';
  const android = Platform.OS === 'android';
  const labelStyle: TextStyle = android
    ? { fontSize: type.nav.fontSize, fontWeight: type.nav.fontWeight, letterSpacing: spaced(0.5) }
    : {
        fontSize: (sidebar ? type.small : type.caption).fontSize,
        fontWeight: type.label.fontWeight,
        letterSpacing: 0,
        ...(sidebar && { marginStart: spacing.sm + spacing.xs }),
      };
  return (
    <Tabs
      screenLayout={({ children }) => <InLanguage>{children}</InLanguage>}
      {...(web && { tabBar: () => null })}
      screenOptions={{
        ...(web && { headerShown: false }),
        // The first tab's bar carries the logo; the others name the tab (or what it shows).
        header: ({ options, route }) => (
          <TabsHeader title={route.name === LOGO_TAB ? null : (options.title ?? null)} />
        ),
        tabBarActiveTintColor: android ? colors.text : colors.accent,
        tabBarInactiveTintColor: colors.muted,
        // Android's navigation bar steps aside for the keyboard, as Android apps' bars do.
        ...(android && { tabBarHideOnKeyboard: true }),
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
                // navigation bar is 80 tall); at least that, so a bigger text size fits.
                minHeight: (android ? 80 : 66) + insets.bottom,
                height: 'auto',
                paddingBottom: insets.bottom,
                // Android's navigation bar has no line along its top: its colour sets it apart.
                ...(android && { paddingTop: 12, elevation: 0, borderTopWidth: 0 }),
              },
            }),
      }}
    >
      {/* The labels are fixed: a screen may put a longer title in the bar (Me: the username). */}
      <Tabs.Screen
        name="index"
        options={{ title: t('Play'), ...label(t('Play'), 1, labelStyle), tabBarIcon: icon('play') }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: t('Leaderboard'),
          ...label(t('Leaderboard'), 2, labelStyle),
          tabBarIcon: icon('leaderboard'),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: t('Me'), ...label(t('Me'), 3, labelStyle), tabBarIcon: icon('me') }}
      />
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
