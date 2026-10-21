import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Pairing, Tournament } from '@/api/endpoints';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Confirm } from '@/components/Confirm';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Notice } from '@/components/Notice';
import { ShareButton } from '@/components/ShareButton';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { plural, t } from '@/i18n';
import { shareLink, timeControlName } from '@/lobby/format';
import { isMine, pairingText, roundsOf, tournamentStatusText } from '@/pro/format';
import { useAwardPairing, usePlayPairing, useTournament, useTournamentAction } from '@/pro/hooks';
import { colors, spacing, type } from '@/theme';

/** A tournament: who is in, the standings, and my games to play. */
export default function TournamentScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const tournament = useTournament(code);
  return (
    <Screen title={tournament.data?.name ?? t('Tournament')} align="top">
      {tournament.error !== null ? (
        <ErrorState error={tournament.error} onRetry={() => void tournament.refetch()} />
      ) : tournament.data === undefined ? (
        <Loading label={t('Loading the tournament')} />
      ) : (
        <Details tournament={tournament.data} />
      )}
    </Screen>
  );
}

function Details({ tournament: tour }: { tournament: Tournament }) {
  const me = useMe();
  const action = useTournamentAction(tour.code);
  const [ending, setEnding] = useState(false);
  const play = usePlayPairing(tour.code);
  const host = tour.host.id === me.id;
  const playing = tour.players.some((p) => p.id === me.id);
  const error = action.error ?? play.error;
  // My game this round (the earlier ones are under the rounds below).
  const mine = tour.pairings.filter((p) => p.round === tour.round && isMine(p, me.id));
  const sitting = tour.byes.some((b) => b.round === tour.round && b.player.id === me.id);
  // The game I asked to start, while my opponent has yet to accept it.
  const asked =
    play.isSuccess && tour.pairings.some((p) => p.id === play.variables && p.state === 'waiting')
      ? play.data.opponent?.username
      : undefined;
  const left = action.isSuccess && action.variables === 'leave' && !playing;
  return (
    <>
      <Text style={styles.muted}>
        {t('{time} · hosted by {name} · {status}', {
          time: timeControlName(tour.time_control),
          name: tour.host.username,
          status: tournamentStatusText(tour),
        })}
      </Text>
      <ErrorNotice error={error} />
      {left && <Notice tone="success">{t('You left the tournament.')}</Notice>}

      {tour.status === 'open' && (
        <Card>
          <Text style={styles.text}>
            {t('{count} of {max} players: {names}', {
              count: tour.players.length,
              max: tour.max_players,
              names: tour.players.map((p) => p.username).join(', '),
            })}
          </Text>
          <Hint>{t('Invite players with this link:')}</Hint>
          <Text style={styles.link} selectable>
            {shareLink(`/tournament/${tour.code}`)}
          </Text>
          <ShareButton path={`/tournament/${tour.code}`} title={t('Share the tournament')} />
          {!playing && (
            <Button
              title={t('Join')}
              busy={action.isPending}
              onPress={() => action.mutate('join')}
            />
          )}
          {playing && !host && (
            <Button
              title={t('Leave')}
              variant="secondary"
              busy={action.isPending}
              onPress={() => action.mutate('leave')}
            />
          )}
          {host && (
            <Button
              title={t('Start the tournament')}
              busy={action.isPending}
              disabled={tour.players.length < 3}
              onPress={() => action.mutate('start')}
            />
          )}
          {host && tour.players.length < 3 && (
            <Hint>{t('At least 3 players are needed to start.')}</Hint>
          )}
        </Card>
      )}

      {tour.status === 'running' && sitting && (
        <Notice tone="info">{t('You have the bye this round: a point, and a rest.')}</Notice>
      )}
      {tour.status === 'running' && mine.length > 0 && (
        <>
          <SectionTitle>{t('Your game, round {round}', { round: tour.round })}</SectionTitle>
          <Hint>{t('Start a game when your opponent is online; it opens for both of you.')}</Hint>
          {asked !== undefined && (
            <Notice tone="info">
              {t('We asked {name} to play. The game opens when they accept.', { name: asked })}
            </Notice>
          )}
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

      {tour.standings.length > 0 && (
        <>
          <SectionTitle>{t('Standings')}</SectionTitle>
          <Card>
            {tour.standings.map((s, i) => (
              <View key={s.player.id} style={styles.standing}>
                <View style={styles.row}>
                  <Text style={styles.rank}>{`${i + 1}.`}</Text>
                  <Text style={[styles.text, styles.grow]}>{s.player.username}</Text>
                  <Text style={styles.text}>
                    {plural(s.points, '{count} point', '{count} points')}
                  </Text>
                </View>
                <Text style={[styles.muted, styles.under]}>
                  {plural(
                    s.played,
                    "{count} game played · opponents' points {score}",
                    "{count} games played · opponents' points {score}",
                    { score: s.buchholz },
                  )}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {roundsOf(tour).map(({ round, games, bye }) => (
        <View key={round} style={styles.round}>
          <SectionTitle>{t('Round {round}', { round })}</SectionTitle>
          <Card>
            {games.map((p) => (
              <Text key={p.id} style={styles.muted}>
                {pairingText(p)}
              </Text>
            ))}
            {bye !== null && (
              <Text style={styles.muted}>{t('{name} has the bye (a point)', { name: bye })}</Text>
            )}
          </Card>
        </View>
      ))}
      {tour.status !== 'open' && (
        <Hint>
          {t(
            "Standings: a point for each win or bye; ties go to whoever met the stronger opponents (their opponents' points added up).",
          )}
        </Hint>
      )}

      {host && tour.status === 'running' && <NoShows tournament={tour} />}

      {host &&
        tour.status === 'running' &&
        (ending ? (
          <Confirm
            question={t(
              'End the tournament now? Games not yet played are not played, and the standings stay as they are.',
            )}
            confirmTitle={t('End the tournament')}
            busy={action.isPending}
            onConfirm={() => action.mutate('finish', { onSettled: () => setEnding(false) })}
            onCancel={() => setEnding(false)}
          />
        ) : (
          <Button
            title={t('End the tournament')}
            variant="secondary"
            onPress={() => setEnding(true)}
          />
        ))}
    </>
  );
}

/** For the host: this round's games nobody has started, to give to whoever turned up. */
function NoShows({ tournament: tour }: { tournament: Tournament }) {
  const award = useAwardPairing(tour.code);
  const [giving, setGiving] = useState<{ pairing: Pairing; winner: 'goat' | 'tiger' } | null>(null);
  const waiting = tour.pairings.filter((p) => p.round === tour.round && p.state === 'waiting');
  if (waiting.length === 0) return null;
  return (
    <>
      <SectionTitle>{t('Games not played yet')}</SectionTitle>
      <Hint>
        {t(
          'If a player does not turn up, give the game to the other: a point for them, and the round can go on.',
        )}
      </Hint>
      <ErrorNotice error={award.error} />
      {waiting.map((p) =>
        giving?.pairing.id === p.id ? (
          <Confirm
            key={p.id}
            question={t(
              'Give this game to {winner}? {loser} gets no point, and it is not played.',
              {
                winner: (giving.winner === 'goat' ? p.goat : p.tiger).username,
                loser: (giving.winner === 'goat' ? p.tiger : p.goat).username,
              },
            )}
            confirmTitle={t('Give the game')}
            busy={award.isPending}
            onConfirm={() =>
              award.mutate(
                { pairingId: p.id, winner: giving.winner },
                { onSettled: () => setGiving(null) },
              )
            }
            onCancel={() => setGiving(null)}
          />
        ) : (
          <Card key={p.id}>
            <Text style={styles.text}>{pairingText(p)}</Text>
            <View style={styles.row}>
              {(['goat', 'tiger'] as const).map((side) => (
                <Button
                  key={side}
                  title={t('Give the game to {name}', { name: p[side].username })}
                  label={t('Give to {name}', { name: p[side].username })}
                  variant="secondary"
                  compact
                  onPress={() => setGiving({ pairing: p, winner: side })}
                />
              ))}
            </View>
          </Card>
        ),
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
          title={t('Play {goat} v {tiger}', { goat: p.goat.username, tiger: p.tiger.username })}
          label={t('Play now')}
          compact
          busy={starting}
          onPress={onPlay}
        />
      )}
      {p.game_id !== null && (
        <Button
          title={t('Open {goat} v {tiger}', { goat: p.goat.username, tiger: p.tiger.username })}
          label={t('Open the game')}
          variant="secondary"
          compact
          onPress={() => router.push(`/game/${p.game_id}`)}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  text: { ...type.small, color: colors.text },
  muted: { ...type.caption, color: colors.muted },
  link: { ...type.small, fontWeight: '600', color: colors.link },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  standing: { gap: 2 },
  // Under the name, past the rank.
  under: { marginStart: 24 + spacing.md },
  rank: { ...type.small, width: 24, fontWeight: '700', color: colors.text },
  grow: { flex: 1 },
  round: { gap: spacing.sm },
});
