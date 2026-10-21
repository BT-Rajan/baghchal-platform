import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GameSummary } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { t } from '@/i18n';
import { historyText } from '@/lobby/format';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Card, Hint, SectionTitle } from './Card';
import { Icon } from './Icon';
import { Upsell } from './Upsell';
import { focusRing } from './focus';
import { pressedLook, ripple } from './press';
import { ErrorState, Loading } from './States';

const PAGE = 20;

/** How many games the home screen's preview shows. */
const PREVIEW = 3;

/** How many a profile shows before "Show more games". */
const FIRST = 5;

/**
 * A player's finished games, newest first; each opens the game to replay it. A profile shows
 * the latest few and more on asking; as a `preview` (the home screen), only the latest three,
 * with a way to the rest on the Me tab.
 */
export function GameHistory({
  username,
  preview = false,
  isMe = false,
}: {
  username: string;
  preview?: boolean;
  /** My own games: the only history whose length my plan sets, so the only one to upsell. */
  isMe?: boolean;
}) {
  const api = useApi();
  const history = useInfiniteQuery({
    queryKey: queryKeys.playerGames(username),
    queryFn: ({ pageParam, signal }) => api.playerGames(username, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: GameSummary[]) =>
      last.length < PAGE ? undefined : last.at(-1)?.finished_at,
  });
  const [shown, setShown] = useState(FIRST);
  const all = history.data?.pages.flat() ?? [];
  const games = all.slice(0, preview ? PREVIEW : shown);
  // More: first the loaded games not shown yet, then the next page from the server.
  const more = () => {
    const next = shown + PAGE;
    setShown(next);
    if (next > all.length && history.hasNextPage) void history.fetchNextPage();
  };
  const mine = useMyPlan();
  const limited = isMe && mine.data !== undefined && !has(mine.data, 'full_history');
  return (
    <>
      <SectionTitle>{t('Recent games')}</SectionTitle>
      {history.error !== null ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : history.data === undefined ? (
        <Loading label={t('Loading games')} />
      ) : games.length === 0 ? (
        <Hint>{t('No finished games yet.')}</Hint>
      ) : (
        <Card>
          {games.map((game, i) => (
            <Pressable
              key={game.id}
              role="link"
              aria-label={t('Replay: {game}', { game: historyText(game) })}
              onPress={() => router.push(`/game/${game.id}`)}
              {...ripple()}
              style={(state) => [
                styles.row,
                i > 0 && styles.divided,
                pressedLook(state.pressed, styles.pressed),
                focusRing(state),
              ]}
            >
              {/* The result at a glance: green won, red lost, dark drawn, grey aborted. */}
              <View style={[styles.mark, { backgroundColor: OUTCOME_COLORS[game.outcome] }]} />
              <Text style={styles.text}>{historyText(game)}</Text>
              <Icon name="chevron" color={colors.muted} size={18} />
            </Pressable>
          ))}
        </Card>
      )}
      {preview && all.length > 0 && (
        <Button
          title={t('See all your games')}
          variant="secondary"
          compact
          onPress={() => router.navigate('/me')}
        />
      )}
      {!preview && limited && (
        <Upsell feature="full_history">
          {t('Your history shows games from the last 30 days. Keep every game.')}
        </Upsell>
      )}
      {!preview && (all.length > shown || history.hasNextPage) && (
        <Button
          title={t('Show more games')}
          variant="secondary"
          busy={history.isFetchingNextPage}
          onPress={more}
        />
      )}
    </>
  );
}

const OUTCOME_COLORS: Record<GameSummary['outcome'], string> = {
  won: colors.success,
  lost: colors.danger,
  drawn: colors.ink,
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
