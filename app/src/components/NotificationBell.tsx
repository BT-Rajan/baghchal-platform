import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNotifications } from '@/lobby/hooks';
import { colors, radius } from '@/theme';

import { focusRing } from './focus';
import { pressedLook, ripple } from './press';
import { Icon } from './Icon';

/** The bell in the bar above the tabs, with how many notifications are unread. */
export function NotificationBell() {
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;
  return (
    <Pressable
      role="button"
      aria-label={unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`}
      onPress={() => router.push('/notifications')}
      {...ripple(true)}
      style={(state) => [styles.bell, pressedLook(state.pressed, styles.pressed), focusRing(state)]}
    >
      <Icon name="bell" color={colors.brandCream} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.count}>{unread > 9 ? '9+' : String(unread)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44 points: the smallest comfortable touch target.
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontSize: 11, fontWeight: '800', color: colors.surface },
});
