import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GameSummary } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { historyText } from '@/lobby/format';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Card, Hint, SectionTitle } from './Card';
import { Icon } from './Icon';
import { Upsell } from './Upsell';
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
  const mine = useMyPlan();
  const limited = mine.data !== undefined && !has(mine.data, 'full_history');
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
          {games.map((game, i) => (
            <Pressable
              key={game.id}
              role="link"
              aria-label={`Replay: ${historyText(game)}`}
              onPress={() => router.push(`/game/${game.id}`)}
              style={(state) => [
                styles.row,
                i > 0 && styles.divided,
                state.pressed && styles.pressed,
                focusRing(state),
              ]}
            >
              {/* The result at a glance: green won, red lost, grey aborted. */}
              <View style={[styles.mark, { backgroundColor: OUTCOME_COLORS[game.outcome] }]} />
              <Text style={styles.text}>{historyText(game)}</Text>
              <Icon name="chevron" color={colors.muted} size={18} />
            </Pressable>
          ))}
        </Card>
      )}
      {limited && (
        <Upsell feature="full_history">
          Your history shows games from the last 30 days. Keep every game.
        </Upsell>
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

const OUTCOME_COLORS: Record<GameSummary['outcome'], string> = {
  won: colors.success,
  lost: colors.danger,
  aborted: colors.offline,
};

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  divided: { borderTopWidth: 1, borderTopColor: colors.subtle },
  pressed: { opacity: 0.7 },
  mark: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  text: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
});
