import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { GameSummary } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { historyText } from '@/lobby/format';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Card, Hint, SectionTitle } from './Card';
import { focusRing } from './focus';
import { ErrorState, Loading } from './States';

const PAGE = 20;

/** A player's finished games, newest first; each opens the game to replay it. */
export function GameHistory({ username }: { username: string }) {
  const api = useApi();
  const history = useInfiniteQuery({
    queryKey: queryKeys.playerGames(username),
    queryFn: ({ pageParam, signal }) => api.playerGames(username, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: GameSummary[]) =>
      last.length < PAGE ? undefined : last.at(-1)?.finished_at,
  });
  const games = history.data?.pages.flat() ?? [];
  return (
    <>
      <SectionTitle>Recent games</SectionTitle>
      {history.error !== null ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : history.data === undefined ? (
        <Loading label="Loading games" />
      ) : games.length === 0 ? (
        <Hint>No finished games yet.</Hint>
      ) : (
        <Card>
          {games.map((game) => (
            <Pressable
              key={game.id}
              role="link"
              aria-label={`Replay: ${historyText(game)}`}
              onPress={() => router.push(`/game/${game.id}`)}
              style={(state) => [styles.row, focusRing(state)]}
            >
              <Text style={styles.text}>{historyText(game)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      {history.hasNextPage && (
        <Button
          title="Show more games"
          variant="secondary"
          busy={history.isFetchingNextPage}
          onPress={() => void history.fetchNextPage()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.xs },
  text: { fontSize: 15, color: colors.text },
});
