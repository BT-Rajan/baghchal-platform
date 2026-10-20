import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Notification } from '@/api/endpoints';
import { Card, Hint } from '@/components/Card';
import { focusRing } from '@/components/focus';
import { ripple } from '@/components/press';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useNow } from '@/components/useNow';
import { useNotifications, useReadNotifications } from '@/lobby/hooks';
import { agoText, notificationLink, notificationText } from '@/lobby/notifications';
import { colors, radius, spacing } from '@/theme';

const ICONS: Record<Notification['kind'], IconName> = {
  challenge: 'play',
  friend_request: 'people',
  friend_accepted: 'people',
  tournament_started: 'trophy',
  tournament_round: 'trophy',
  tournament_finished: 'trophy',
};

/** What happened while I was away, newest first; each leads to where it happened. */
export default function Notifications() {
  const notifications = useNotifications();
  const read = useReadNotifications();
  const now = useNow(60_000);
  const unread = notifications.data?.unread ?? 0;
  const { mutate } = read;
  // Opening the list is reading it.
  useEffect(() => {
    if (unread > 0) mutate();
  }, [unread, mutate]);
  return (
    <Screen align="top" refreshable>
      {notifications.error !== null ? (
        <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : notifications.data === undefined ? (
        <Loading label="Loading your notifications" />
      ) : notifications.data.items.length === 0 ? (
        <Hint>Nothing yet. Challenges, friend requests and tournaments will show here.</Hint>
      ) : (
        <Card>
          {notifications.data.items.map((n, i) => {
            const link = notificationLink(n);
            return (
              <Pressable
                key={n.id}
                role={link === null ? undefined : 'link'}
                aria-label={notificationText(n)}
                disabled={link === null}
                onPress={() => link !== null && router.push(link)}
                {...ripple()}
                style={(state) => [styles.row, i > 0 && styles.divided, focusRing(state)]}
              >
                <View style={[styles.icon, !n.read && styles.unread]}>
                  <Icon name={ICONS[n.kind]} color={colors.accent} size={20} />
                </View>
                <View style={styles.words}>
                  <Text style={[styles.text, !n.read && styles.bold]}>{notificationText(n)}</Text>
                  <Text style={styles.when}>{agoText(n.created_at, now)}</Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  divided: { borderTopWidth: 1, borderTopColor: colors.subtle },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unread: { backgroundColor: colors.accentSurface },
  words: { flex: 1, gap: 2 },
  text: { fontSize: 15, lineHeight: 21, color: colors.text },
  bold: { fontWeight: '700' },
  when: { fontSize: 13, color: colors.muted },
});
