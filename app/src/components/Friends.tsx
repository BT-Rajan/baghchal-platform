import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useFriends, useFriendship } from '@/lobby/hooks';
import { colors, spacing, type } from '@/theme';

import { Button } from './Button';
import { Card, SectionTitle } from './Card';
import { PlayerRow } from './PlayerRow';
import { ErrorNotice } from './ErrorNotice';

/** Friend requests waiting for my answer (the web's home, the apps' Friends screen). */
export function FriendRequests() {
  const friends = useFriends();
  const change = useFriendship();
  const incoming = friends.data?.incoming ?? [];
  if (incoming.length === 0) return null;
  return (
    <>
      <SectionTitle>{t('Friend requests')}</SectionTitle>
      <ErrorNotice error={change.error} />
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
      <SectionTitle>{t('Your friends')}</SectionTitle>
      <Card>
        {list.map((player) => (
          <PlayerRow key={player.id} player={player} isMe={player.id === myId} />
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  // The buttons move under the words when the row is too narrow for both.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  text: { ...type.small, color: colors.text, flexGrow: 1, flexShrink: 1, flexBasis: 160 },
});
