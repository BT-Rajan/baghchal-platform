import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { describeError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { colors } from '@/theme';

/** A game's state. The board and moves are added with the game screen proper. */
export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const game = useQuery({
    queryKey: queryKeys.game(id),
    queryFn: ({ signal }) => api.game(id, signal),
  });
  const g = game.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Game' }} />
      {game.error !== null && <Notice tone="error">{describeError(game.error)}</Notice>}
      {g === undefined ? (
        game.error === null && <Hint>Loading…</Hint>
      ) : (
        <Text style={{ fontSize: 16, color: colors.text }}>
          {`${g.goat.username} (goats) vs ${g.tiger.username} (tigers) · ${g.time_control}` +
            ` · ${g.rated ? 'rated' : 'casual'} · ${g.status === 'active' ? `move ${g.ply + 1}` : 'finished'}`}
        </Text>
      )}
    </Screen>
  );
}
