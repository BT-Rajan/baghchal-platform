import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { TabIcon, type TabIconName } from '@/components/TabIcon';
import { colors } from '@/theme';

function icon(name: TabIconName) {
  return function TabBarIcon({ color }: { color: ColorValue }) {
    return <TabIcon name={name} color={color} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
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
