import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Board } from '@/components/game/Board';
import { GameActions } from '@/components/game/GameActions';
import { MoveList } from '@/components/game/MoveList';
import { PlayerBar } from '@/components/game/PlayerBar';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useServerNow } from '@/components/useNow';
import { parseBfen, type Piece } from '@/game/bfen';
import { firstMoveSecondsLeft } from '@/game/clock';
import {
  lastMoveText,
  matchSummary,
  other,
  playerOf,
  resultText,
  sideOf,
  turnText,
} from '@/game/describe';
import { useGame, useGameAction, useMove } from '@/game/hooks';
import { boardSize, gameLayout } from '@/game/layout';
import { TIME_CONTROLS } from '@/lobby/format';
import { useCreateChallenge } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const query = useGame(id, me.id);
  const move = useMove(id);
  const action = useGameAction(id);
  const { width, height } = useWindowDimensions();
  const game = query.data;

  if (game === undefined) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Game' }} />
        {query.error !== null ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <Loading label="Loading the game" />
        )}
      </Screen>
    );
  }

  const mine = sideOf(game, me.id);
  const position = parseBfen(game.position);
  // Bottom of the screen is me; spectators see goats at the bottom.
  const bottom: Piece = mine ?? 'goat';
  const myTurn = game.status === 'active' && game.side_to_move === mine && !move.isPending;
  const error = move.error ?? action.error;
  const layout = gameLayout(width, height);
  const wide = layout !== 'stacked';

  const board =
    position === null ? (
      <Notice tone="error">This position could not be shown.</Notice>
    ) : (
      <Board
        key={game.ply}
        position={position}
        legalMoves={myTurn ? game.legal_moves : []}
        lastMove={game.moves.at(-1)}
        onMove={(m) => move.mutate({ ply: game.ply, move: m })}
      />
    );

  const opponentBar = <PlayerBar game={game} side={other(bottom)} isMe={mine === other(bottom)} />;
  const myBar = <PlayerBar game={game} side={bottom} isMe={mine === bottom} />;

  const panel = (
    <View style={styles.panel}>
      {layout === 'short' && opponentBar}
      {layout === 'short' && myBar}
      <Status game={game} mine={mine} />
      {error !== null && <Notice tone="error">{describeError(error)}</Notice>}
      {position !== null && (
        <Text style={styles.counts}>
          {`Goats to place: ${position.inHand} · Goats captured: ${position.captured} of 5`}
        </Text>
      )}
      {mine !== null && game.status === 'active' && (
        <GameActions
          game={game}
          me={mine}
          pending={action.isPending ? action.variables : null}
          onAction={(a) => action.mutate(a)}
        />
      )}
      {game.status === 'finished' && mine !== null && <Rematch game={game} mine={mine} />}
      {game.status === 'finished' && (
        <Button
          title="Back to the lobby"
          variant="secondary"
          onPress={() => router.navigate('/')}
        />
      )}
      <SectionTitle>Moves</SectionTitle>
      <MoveList moves={game.moves} />
    </View>
  );

  return (
    <Screen align="top" wide={wide}>
      <Stack.Screen options={{ title: `${game.goat.username} vs ${game.tiger.username}` }} />
      <View style={wide ? styles.row : styles.column}>
        <View style={wide ? styles.boardWide : styles.boardColumn}>
          {layout !== 'short' && opponentBar}
          <View style={[styles.boardBox, { maxWidth: boardSize(layout, width, height) }]}>
            {board}
          </View>
          {layout !== 'short' && myBar}
        </View>
        {panel}
      </View>
    </Screen>
  );
}

/**
 * Challenge the same player again: a casual game (rated matches are limited to one a day per
 * pair) with sides swapped. The answer comes in the lobby.
 */
function Rematch({ game, mine }: { game: Game; mine: Piece }) {
  const create = useCreateChallenge();
  const timeControl = TIME_CONTROLS.find((tc) => tc.label === game.time_control)?.label;
  if (timeControl === undefined) return null;
  const opponent = playerOf(game, other(mine)).username;
  return (
    <>
      {create.error !== null && <Notice tone="error">{describeError(create.error)}</Notice>}
      <Button
        title={`Rematch ${opponent}`}
        label="Rematch (casual, sides swapped)"
        busy={create.isPending}
        onPress={() =>
          create.mutate(
            { opponent, time_control: timeControl, rated: false, side: other(mine) },
            { onSuccess: () => router.navigate('/') },
          )
        }
      />
    </>
  );
}

function Status({ game, mine }: { game: Game; mine: Piece | null }) {
  const now = useServerNow();
  const result = resultText(game, mine);
  const match = matchSummary(game);
  const firstMove = firstMoveSecondsLeft(game, now);
  const turn = turnText(game, mine);
  const last = lastMoveText(game, mine);
  return (
    <>
      {result !== null && (
        <Notice tone={game.result?.winner === mine ? 'success' : 'info'}>{result}</Notice>
      )}
      {turn !== null && (
        <Text
          style={styles.turn}
          aria-live="polite"
          // Screen readers hear what just happened, then whose turn it is.
          aria-label={[last, turn].filter((part) => part !== null).join(' ')}
        >
          {firstMove === null
            ? turn
            : `${turn} · ${firstMove} s to make a first move` +
              (game.match?.game === 2 ? ', or it counts as a loss' : '')}
        </Text>
      )}
      {match !== null && (
        <Card>
          <Text style={styles.matchTitle}>{match.title}</Text>
          {match.score !== '' && <Text style={styles.matchScore}>{match.score}</Text>}
          {match.otherGameId !== null && (
            <Button
              title={game.match?.game === 1 ? 'Go to game 2' : 'Back to game 1'}
              variant="secondary"
              onPress={() => router.replace(`/game/${match.otherGameId}`)}
            />
          )}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  column: { gap: spacing.md },
  boardWide: { flex: 1, maxWidth: 640, gap: spacing.sm },
  boardColumn: { gap: spacing.sm },
  boardBox: { width: '100%', alignSelf: 'center' },
  panel: { flex: 1, gap: spacing.md, minWidth: 280 },
  turn: { fontSize: 18, fontWeight: '700', color: colors.text },
  counts: { fontSize: 14, color: colors.muted },
  matchTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  matchScore: { fontSize: 20, fontWeight: '700', color: colors.text },
});
