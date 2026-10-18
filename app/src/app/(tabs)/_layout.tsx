import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandBar } from '@/components/brand/Logo';
import { TabIcon, type TabIconName } from '@/components/TabIcon';
import { colors } from '@/theme';

function icon(name: TabIconName) {
  return function TabBarIcon({ color }: { color: ColorValue }) {
    return <TabIcon name={name} color={color} />;
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        header: () => <TabsHeader />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Room for the icon and a whole label, above the home indicator.
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom,
        },
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
