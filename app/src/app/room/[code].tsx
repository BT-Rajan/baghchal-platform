import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { invitationText, roomText, shareLink } from '@/pro/format';
import { useJoinRoom, useRoom } from '@/pro/hooks';
import { colors } from '@/theme';

/** A private room, opened from its link: join and play, or (the host) share it. */
export default function RoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const me = useMe();
  const room = useRoom(code);
  const join = useJoinRoom(code);
  const gameId = room.data?.game_id ?? null;
  return (
    <Screen title="Private room" align="top">
      {room.error !== null ? (
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      ) : room.data === undefined ? (
        <Loading label="Loading the room" />
      ) : room.data.host.id === me.id ? (
        <Card>
          <Text style={styles.text}>{roomText(room.data)}</Text>
          {room.data.status === 'open' ? (
            <>
              <Hint>Send this link to a friend. The game starts when they open it.</Hint>
              <Text style={styles.link} selectable>
                {shareLink(`/room/${room.data.code}`)}
              </Text>
            </>
          ) : (
            <Hint>
              {room.data.status === 'played' ? 'Your friend joined.' : 'This room is closed.'}
            </Hint>
          )}
        </Card>
      ) : (
        <Card>
          <Text style={styles.text}>{invitationText(room.data)}</Text>
          {join.error !== null && <Notice tone="error">{describeError(join.error)}</Notice>}
          {room.data.status === 'open' ? (
            <Button title="Join and play" busy={join.isPending} onPress={() => join.mutate()} />
          ) : (
            <Hint>This room is closed. Ask your friend for a new link.</Hint>
          )}
        </Card>
      )}
      {gameId !== null && (
        <Button
          title="Go to the game"
          variant="secondary"
          onPress={() => router.push(`/game/${gameId}`)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, color: colors.text },
  link: { fontSize: 15, fontWeight: '600', color: colors.accent },
});
