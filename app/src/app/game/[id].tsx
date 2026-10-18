import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useApi, useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Board } from '@/components/game/Board';
import { GameActions } from '@/components/game/GameActions';
import { MoveList } from '@/components/game/MoveList';
import { PlayerBar } from '@/components/game/PlayerBar';
import { soundSupported } from '@/components/game/sound';
import { useEnding, useMoveSounds, useSoundSetting } from '@/components/game/useMoveSounds';
import { Victory } from '@/components/game/Victory';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useServerNow } from '@/components/useNow';
import { parseBfen, type Piece } from '@/game/bfen';
import { firstMoveSecondsLeft } from '@/game/clock';
import {
  isComputer,
  lastMoveText,
  matchSummary,
  nameOf,
  other,
  playerOf,
  resultText,
  sideOf,
  turnText,
} from '@/game/describe';
import { useGame, useGameAction, useMove } from '@/game/hooks';
import { boardSize, gameLayout } from '@/game/layout';
import { TIME_CONTROLS } from '@/lobby/format';
import { useCreateChallenge, useOpenStartedGame } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const query = useGame(id, me.id);
  const move = useMove(id);
  const action = useGameAction(id);
  const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState<number | null>(null); // the move being replayed
  const game = query.data;
  const [soundOn, setSoundOn] = useSoundSetting();
  useMoveSounds(game, soundOn);
  const [ending, dismissEnding] = useEnding(game, me.id, soundOn);

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
  // A finished game can be stepped through; otherwise the board shows the game as it is.
  const replaying = game.positions.length > 0;
  const ply = replaying ? Math.min(shown ?? game.ply, game.ply) : game.ply;
  const position = parseBfen(replaying ? (game.positions[ply] ?? game.position) : game.position);
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
        key={`${game.ply}-${ply}`}
        position={position}
        legalMoves={myTurn ? game.legal_moves : []}
        lastMove={ply > 0 ? game.moves[ply - 1] : undefined}
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
      {replaying && <Replay ply={ply} total={game.ply} onShow={setShown} />}
      {error !== null && <Notice tone="error">{describeError(error)}</Notice>}
      {position !== null && (
        <Text style={styles.counts}>
          {`Goats to place: ${position.inHand} · Goats captured: ${position.captured} of 5`}
        </Text>
      )}
      {soundSupported() && game.status === 'active' && (
        <Button
          title={soundOn ? 'Turn sounds off' : 'Turn sounds on'}
          variant="secondary"
          compact
          onPress={() => setSoundOn(!soundOn)}
        />
      )}
      {mine !== null && game.status === 'active' && (
        <GameActions
          game={game}
          me={mine}
          pending={action.isPending ? action.variables : null}
          onAction={(a) => action.mutate(a)}
        />
      )}
      {game.status === 'finished' &&
        mine !== null &&
        (game.computer === null ? (
          <Rematch game={game} mine={mine} />
        ) : (
          <PlayAgain game={game} mine={mine} />
        ))}
      {game.status === 'finished' && mine !== null && !isComputer(game, other(mine)) && (
        <Button
          title={`Report ${playerOf(game, other(mine)).username}`}
          variant="secondary"
          onPress={() =>
            router.push(`/report/${playerOf(game, other(mine)).username}?game=${game.id}`)
          }
        />
      )}
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
      <Stack.Screen options={{ title: `${nameOf(game, 'goat')} vs ${nameOf(game, 'tiger')}` }} />
      <View style={wide ? styles.row : styles.column}>
        <View style={wide ? styles.boardWide : styles.boardColumn}>
          {layout !== 'short' && opponentBar}
          <View style={[styles.boardBox, { maxWidth: boardSize(layout, width, height) }]}>
            {board}
            {ending !== null && <Victory ending={ending} onClose={dismissEnding} />}
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

/** Step through a finished game: start, back, forward, end. */
function Replay({
  ply,
  total,
  onShow,
}: {
  ply: number;
  total: number;
  onShow: (ply: number) => void;
}) {
  return (
    <View style={styles.replay}>
      <Text style={styles.counts}>
        {ply === 0 ? 'Start position' : `After move ${ply} of ${total}`}
      </Text>
      <View style={styles.replayButtons}>
        <Button
          title="Start position"
          label="⏮"
          compact
          variant="secondary"
          disabled={ply === 0}
          onPress={() => onShow(0)}
        />
        <Button
          title="Previous move"
          label="◀"
          compact
          variant="secondary"
          disabled={ply === 0}
          onPress={() => onShow(ply - 1)}
        />
        <Button
          title="Next move"
          label="▶"
          compact
          variant="secondary"
          disabled={ply === total}
          onPress={() => onShow(ply + 1)}
        />
        <Button
          title="Final position"
          label="⏭"
          compact
          variant="secondary"
          disabled={ply === total}
          onPress={() => onShow(total)}
        />
      </View>
    </View>
  );
}

/** Another game against the computer at the same level, sides swapped. */
function PlayAgain({ game, mine }: { game: Game; mine: Piece }) {
  const api = useApi();
  const openStarted = useOpenStartedGame();
  const timeControl = TIME_CONTROLS.find((tc) => tc.label === game.time_control)?.label;
  const start = useMutation({
    mutationFn: () =>
      api.playComputer({
        level: game.computer ?? 'medium',
        side: other(mine),
        time_control: timeControl ?? '10+5',
      }),
    onSuccess: openStarted,
  });
  return (
    <>
      {start.error !== null && <Notice tone="error">{describeError(start.error)}</Notice>}
      <Button
        title="Play the computer again"
        label="Play again (sides swapped)"
        busy={start.isPending}
        onPress={() => start.mutate()}
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
  replay: { gap: spacing.xs },
  replayButtons: { flexDirection: 'row', gap: spacing.sm },
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
