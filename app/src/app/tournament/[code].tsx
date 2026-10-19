import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { Pairing, Tournament } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { isMine, pairingText, shareLink, tournamentStatusText } from '@/pro/format';
import { usePlayPairing, useTournament, useTournamentAction } from '@/pro/hooks';
import { colors, spacing } from '@/theme';

/** A tournament: who is in, the standings, and my games to play. */
export default function TournamentScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const tournament = useTournament(code);
  return (
    <Screen title={tournament.data?.name ?? 'Tournament'} align="top">
      {tournament.error !== null ? (
        <ErrorState error={tournament.error} onRetry={() => void tournament.refetch()} />
      ) : tournament.data === undefined ? (
        <Loading label="Loading the tournament" />
      ) : (
        <Details tournament={tournament.data} />
      )}
    </Screen>
  );
}

function Details({ tournament: t }: { tournament: Tournament }) {
  const me = useMe();
  const action = useTournamentAction(t.code);
  const play = usePlayPairing(t.code);
  const host = t.host.id === me.id;
  const playing = t.players.some((p) => p.id === me.id);
  const error = action.error ?? play.error;
  const mine = t.pairings.filter((p) => isMine(p, me.id));
  return (
    <>
      <Text style={styles.muted}>
        {`${t.time_control} · hosted by ${t.host.username} · ${tournamentStatusText(t)}`}
      </Text>
      {error !== null && <Notice tone="error">{describeError(error)}</Notice>}

      {t.status === 'open' && (
        <Card>
          <Text style={styles.text}>{t.players.map((p) => p.username).join(', ')}</Text>
          <Hint>Invite players with this link:</Hint>
          <Text style={styles.link} selectable>
            {shareLink(`/tournament/${t.code}`)}
          </Text>
          {!playing && (
            <Button title="Join" busy={action.isPending} onPress={() => action.mutate('join')} />
          )}
          {playing && !host && (
            <Button
              title="Leave"
              variant="secondary"
              busy={action.isPending}
              onPress={() => action.mutate('leave')}
            />
          )}
          {host && (
            <Button
              title="Start the tournament"
              busy={action.isPending}
              disabled={t.players.length < 3}
              onPress={() => action.mutate('start')}
            />
          )}
          {host && t.players.length < 3 && <Hint>At least 3 players are needed to start.</Hint>}
        </Card>
      )}

      {t.standings.length > 0 && (
        <>
          <SectionTitle>Standings</SectionTitle>
          <Card>
            {t.standings.map((s, i) => (
              <View key={s.player.id} style={styles.row}>
                <Text style={styles.rank}>{`${i + 1}.`}</Text>
                <Text style={[styles.text, styles.grow]}>{s.player.username}</Text>
                <Text
                  style={styles.text}
                >{`${s.points} ${s.points === 1 ? 'point' : 'points'}`}</Text>
                <Text style={styles.muted}>{`${s.played} played`}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {t.status === 'running' && mine.length > 0 && (
        <>
          <SectionTitle>Your games</SectionTitle>
          <Hint>Start a game when your opponent is online; it opens for both of you.</Hint>
          {mine.map((p) => (
            <PairingRow
              key={p.id}
              pairing={p}
              starting={play.isPending && play.variables === p.id}
              onPlay={() => play.mutate(p.id)}
            />
          ))}
        </>
      )}

      {t.pairings.length > 0 && (
        <>
          <SectionTitle>All games</SectionTitle>
          <Card>
            {t.pairings.map((p) => (
              <Text key={p.id} style={styles.muted}>
                {pairingText(p)}
              </Text>
            ))}
          </Card>
        </>
      )}

      {host && t.status === 'running' && (
        <Button
          title="End the tournament"
          variant="secondary"
          busy={action.isPending}
          onPress={() => action.mutate('finish')}
        />
      )}
    </>
  );
}

function PairingRow({
  pairing: p,
  starting,
  onPlay,
}: {
  pairing: Pairing;
  starting: boolean;
  onPlay: () => void;
}) {
  return (
    <Card>
      <Text style={styles.text}>{pairingText(p)}</Text>
      {p.state === 'waiting' && (
        <Button
          title={`Play ${p.goat.username} v ${p.tiger.username}`}
          label="Play now"
          compact
          busy={starting}
          onPress={onPlay}
        />
      )}
      {p.game_id !== null && (
        <Button
          title={`Open ${p.goat.username} v ${p.tiger.username}`}
          label="Open the game"
          variant="secondary"
          compact
          onPress={() => router.push(`/game/${p.game_id}`)}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  link: { fontSize: 15, fontWeight: '600', color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 24, fontSize: 15, fontWeight: '700', color: colors.text },
  grow: { flex: 1 },
});
