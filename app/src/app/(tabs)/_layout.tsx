import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { ConnectionBadge } from '@/components/ConnectionBadge';
import { usePalette } from '@/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.text,
        headerRight: () => <ConnectionBadge />,
        tabBarActiveTintColor: palette.accent,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Play', tabBarIcon: icon('♟') }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard', tabBarIcon: icon('🏆') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
