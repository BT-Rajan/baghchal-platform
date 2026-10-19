import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ApiError } from '@/api/errors';
import type { Game, Side } from '@/api/types';
import { useMe } from '@/auth/session';
import { Board } from '@/components/Board';
import { PlayerBar } from '@/components/PlayerBar';
import { Body, Button, Card, ErrorText, Heading, Loading, Row, Screen } from '@/components/ui';
import { parseBfen } from '@/game/bfen';
import { opposite, sideOf, statusLine } from '@/game/describe';
import { useGame, useGameAction, useNow } from '@/hooks/queries';
import { keys } from '@/realtime/cache';
import { useRealtime } from '@/realtime/provider';
import { api } from '@/services';
import { space, usePalette } from '@/theme';

const WIDE = 760;

export default function GameScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const game = useGame(id);
  const notPlayer =
    game.error instanceof ApiError && (game.error.status === 403 || game.error.status === 404);
  return (
    <Screen>
      <Stack.Screen
        options={{
          title: game.data ? `${game.data.goat.username} vs ${game.data.tiger.username}` : 'Game',
        }}
      />
      {game.data ? (
        <GameView game={game.data} />
      ) : game.isLoading ? (
        <Loading />
      ) : notPlayer ? (
        <Body>This game is not available.</Body>
      ) : (
        <ErrorText error={game.error} />
      )}
    </Screen>
  );
}

function GameView({ game }: { game: Game }) {
  const me = useMe();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const { clock } = useRealtime();
  const mine = sideOf(game, me.id);
  const active = game.status === 'active';
  const serverNow = clock.serverNow(useNow(100, active));
  const [confirmResign, setConfirmResign] = useState(false);

  const move = useGameAction(game.id, (ply: number, text: string) => api.move(game.id, ply, text));
  const resign = useGameAction(game.id, () => api.resign(game.id));
  const abort = useGameAction(game.id, () => api.abort(game.id));
  const claim = useGameAction(game.id, () => api.claimAbandonment(game.id));

  const myTurn = active && mine !== null && game.side_to_move === mine;
  const onMove = useCallback((text: string) => move.mutate([game.ply, text]), [move, game.ply]);

  const opponentSide: Side = mine ? opposite(mine) : 'tiger';
  const bottomSide: Side = mine ?? 'goat';
  const opponent = game[opponentSide];
  // Poll the opponent's presence only when an abandonment claim could matter.
  const watchOpponent = active && mine !== null && game.side_to_move === opponentSide;
  const presence = useQuery({
    queryKey: keys.profile(opponent.username),
    queryFn: () => api.profile(opponent.username),
    enabled: watchOpponent,
    refetchInterval: watchOpponent ? 10_000 : false,
  });
  const opponentGone = watchOpponent && presence.data?.online === false;

  const position = parseBfen(game.position);
  const wide = width >= WIDE;
  const error = move.error ?? resign.error ?? abort.error ?? claim.error;
  const quietError =
    error instanceof ApiError && ['stale_position', 'not_your_turn'].includes(error.code);

  const board = (
    <View style={[styles.boardColumn, wide && styles.boardWide]}>
      <PlayerBar game={game} side={opponentSide} serverNow={serverNow} />
      <Board
        position={game.position}
        legalMoves={myTurn ? game.legal_moves : []}
        lastMove={game.moves[game.moves.length - 1]}
        onMove={onMove}
        disabled={!myTurn || move.isPending}
      />
      <PlayerBar game={game} side={bottomSide} serverNow={serverNow} />
    </View>
  );

  const panel = (
    <View style={[styles.panel, wide && styles.panelWide]}>
      <Card>
        <Text accessibilityLiveRegion="polite" style={[styles.status, { color: palette.text }]}>
          {statusLine(game, mine)}
        </Text>
        <Body muted>
          {game.time_control} · {game.rated ? 'rated' : 'casual'} · goats in hand{' '}
          {position.goatsInHand} · captured {position.goatsCaptured}/5
        </Body>
        {quietError ? null : <ErrorText error={error} />}
      </Card>

      {game.match ? <MatchCard game={game} /> : null}

      {active && mine ? (
        <Row>
          {game.ply < 2 ? (
            <Button
              label="Abort"
              kind="secondary"
              onPress={() => abort.mutate([])}
              busy={abort.isPending}
            />
          ) : confirmResign ? (
            <>
              <Button
                label="Confirm resign"
                kind="danger"
                onPress={() => resign.mutate([])}
                busy={resign.isPending}
              />
              <Button
                label="Keep playing"
                kind="secondary"
                onPress={() => setConfirmResign(false)}
              />
            </>
          ) : (
            <Button label="Resign" kind="danger" onPress={() => setConfirmResign(true)} />
          )}
        </Row>
      ) : null}

      {opponentGone ? (
        <Card>
          <Body>
            {opponent.username} seems to have left. Once they have been away for 60 seconds on their
            turn you can claim the win.
          </Body>
          <Button label="Claim win" onPress={() => claim.mutate([])} busy={claim.isPending} />
        </Card>
      ) : null}

      {!active ? (
        <Button label="Back to lobby" kind="secondary" onPress={() => router.navigate('/')} />
      ) : null}

      <Heading>Moves</Heading>
      <MoveList moves={game.moves} />
    </View>
  );

  return (
    <View style={[styles.layout, wide && styles.layoutWide]}>
      {board}
      {panel}
    </View>
  );
}

function MatchCard({ game }: { game: Game }) {
  const match = game.match!;
  const other = match.games.find((g) => g !== game.id);
  return (
    <Card>
      <Body>
        Rated match, game {match.game} of 2 ·{' '}
        {match.score.map((s) => `${s.player.username} ${s.points}`).join(' – ')}
      </Body>
      {other ? (
        <Button
          label={match.game === 1 ? 'Go to game 2' : 'See game 1'}
          kind="secondary"
          onPress={() => router.replace(`/game/${other}`)}
        />
      ) : null}
    </Card>
  );
}

function MoveList({ moves }: { moves: readonly string[] }) {
  const palette = usePalette();
  if (!moves.length) return <Body muted>No moves yet. Goats move first.</Body>;
  const pairs: [number, string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push([i / 2 + 1, moves[i]!, moves[i + 1]]);
  return (
    <View style={styles.moves}>
      {pairs.map(([n, goat, tiger]) => (
        <Text key={n} style={[styles.move, { color: palette.text }]}>
          <Text style={{ color: palette.muted }}>{n}. </Text>
          {goat} {tiger ?? ''}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { gap: space.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  boardColumn: { gap: space.sm, width: '100%', maxWidth: 560, alignSelf: 'center' },
  boardWide: { flex: 3, alignSelf: 'flex-start' },
  panel: { gap: space.md },
  panelWide: { flex: 2, minWidth: 280 },
  status: { fontSize: 17, fontWeight: '600' },
  moves: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  move: { fontVariant: ['tabular-nums'], minWidth: 120 },
});
