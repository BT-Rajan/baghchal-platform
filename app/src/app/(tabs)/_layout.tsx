import { Tabs } from 'expo-router';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandBar } from '@/components/brand/Logo';
import { Icon, type IconName } from '@/components/Icon';
import { colors } from '@/theme';

/** From this width the tabs are a sidebar, not a bar stretched along the bottom. */
const SIDEBAR_WIDTH = 900;

function icon(name: IconName) {
  return function TabBarIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} color={color} />;
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_WIDTH;
  return (
    <Tabs
      screenOptions={{
        header: () => <TabsHeader />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: sidebar ? 15 : 13, lineHeight: 18, fontWeight: '600' },
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
                // Room for the icon and a whole label, above the home indicator.
                height: 66 + insets.bottom,
                paddingBottom: insets.bottom,
              },
            }),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Play', tabBarIcon: icon('play') }} />
      <Tabs.Screen
        name="leaderboard"
        options={{ title: 'Leaderboard', tabBarIcon: icon('leaderboard') }}
      />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('me') }} />
    </Tabs>
  );
}

/** The brand bar above every tab, reaching up under the status bar. */
function TabsHeader() {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.brandInk }}>
      <BrandBar />
    </SafeAreaView>
  );
}
