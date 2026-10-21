import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text } from 'react-native';

import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { plural, t } from '@/i18n';
import { dateTimeText, figuresText, thinkText } from '@/lobby/moderation';
import { colors } from '@/theme';

import { Card, Hint } from './Card';
import { ErrorState, Loading } from './States';
import { TextLink } from './TextLink';

/** For moderators: how close a player's recent rated games came to the engine. */
export function FairPlaySection({ username }: { username: string }) {
  const api = useApi();
  const found = useQuery({
    queryKey: queryKeys.modFairPlay(username),
    queryFn: ({ signal }) => api.modFairPlay(username, signal),
  });
  return (
    <>
      {found.error !== null ? (
        <ErrorState error={found.error} onRetry={() => void found.refetch()} />
      ) : found.data === undefined ? (
        <Loading label={t('Loading fair-play figures')} />
      ) : found.data.games.length === 0 ? (
        <Hint>{t('No rated games checked yet.')}</Hint>
      ) : (
        <>
          <Card>
            <Text style={styles.text}>
              {plural(
                found.data.games.length,
                'Last {count} rated game, quick review: {figures}',
                'Last {count} rated games, quick review: {figures}',
                { figures: figuresText(found.data.screen) },
              )}
            </Text>
            {found.data.confirm !== null && (
              <Text style={styles.text}>
                {t('Deep review: {figures}', { figures: figuresText(found.data.confirm) })}
              </Text>
            )}
            <Text style={styles.muted}>
              {found.data.screen_passed
                ? t('Clean enough for an engine: a deep review was asked for.')
                : t('Nothing unusual in the quick review.')}
            </Text>
            <Text style={styles.muted}>
              {t('A reason to look at the games, never proof on its own.')}
            </Text>
          </Card>
          {found.data.games.map((game) => (
            <Card key={game.game_id}>
              <Text style={styles.text}>
                {game.side === 'goat'
                  ? t('Goats against {name} · {date}', {
                      name: game.opponent.username,
                      date: dateTimeText(game.checked_at),
                    })
                  : t('Tigers against {name} · {date}', {
                      name: game.opponent.username,
                      date: dateTimeText(game.checked_at),
                    })}
              </Text>
              <Text style={styles.muted}>
                {t('Quick: {figures}', { figures: figuresText(game.screen) })}
              </Text>
              {game.confirm !== null && (
                <Text style={styles.muted}>
                  {t('Deep: {figures}', { figures: figuresText(game.confirm) })}
                </Text>
              )}
              <Text style={styles.muted}>{thinkText(game.think_median_ms, game.fast_moves)}</Text>
              <TextLink href={`/game/${game.game_id}`}>{t('Open the game')}</TextLink>
            </Card>
          ))}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
