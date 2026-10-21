import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { t } from '@/i18n';
import { useFriends, useFriendship } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Card, SectionTitle } from './Card';
import { Notice } from './Notice';
import { PlayerRow } from './PlayerRow';

/** Friend requests waiting for my answer, on the home screen. */
export function FriendRequests() {
  const friends = useFriends();
  const change = useFriendship();
  const incoming = friends.data?.incoming ?? [];
  if (incoming.length === 0) return null;
  return (
    <>
      <SectionTitle>{t('Friend requests')}</SectionTitle>
      {change.error !== null && <Notice tone="error">{describeError(change.error)}</Notice>}
      <Card>
        {incoming.map((player) => {
          const busy = change.isPending && change.variables.username === player.username;
          return (
            <View key={player.id} style={styles.row}>
              <Text style={styles.text}>
                {t('{name} wants to be friends.', { name: player.username })}
              </Text>
              <Button
                title={t("Accept {name}'s friend request", { name: player.username })}
                label={t('Accept')}
                variant="secondary"
                compact
                busy={busy && change.variables.add}
                onPress={() => change.mutate({ username: player.username, add: true })}
              />
              <Button
                title={t("Decline {name}'s friend request", { name: player.username })}
                label={t('Decline')}
                variant="secondary"
                compact
                busy={busy && !change.variables.add}
                onPress={() => change.mutate({ username: player.username, add: false })}
              />
            </View>
          );
        })}
      </Card>
    </>
  );
}

/** My friends, online first, each a tap from a challenge. Nothing until I have some. */
export function FriendList({ myId }: { myId: string }) {
  const friends = useFriends();
  const list = friends.data?.friends ?? [];
  if (list.length === 0) return null;
  return (
    <>
      <SectionTitle>{t('Friends')}</SectionTitle>
      <Card>
        {list.map((player) => (
          <PlayerRow key={player.id} player={player} isMe={player.id === myId} />
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, fontSize: 15, color: colors.text },
});
