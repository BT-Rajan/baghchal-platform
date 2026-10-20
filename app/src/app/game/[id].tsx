import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { annotate } from '@/analysis/format';
import { useAnalysis } from '@/analysis/hooks';
import type { Game } from '@/api/endpoints';
import { useAppearance, useChooseAppearance } from '@/appearance/hooks';
import { describeError } from '@/api/errors';
import { useApi, useMe } from '@/auth/session';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Confirm } from '@/components/Confirm';
import { AnalysisPanel } from '@/components/game/AnalysisPanel';
import { Board } from '@/components/game/Board';
import { Coach } from '@/components/game/Coach';
import { ChatPanel } from '@/components/game/ChatPanel';
import { GameActions } from '@/components/game/GameActions';
import { MoveList } from '@/components/game/MoveList';
import { PieceCounts } from '@/components/game/PieceCounts';
import { PlayerBar } from '@/components/game/PlayerBar';
import { soundSupported } from '@/components/game/sound';
import { useEnding, useMoveSounds } from '@/components/game/useMoveSounds';
import { Victory } from '@/components/game/Victory';
import { IconButton } from '@/components/IconButton';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useNow, useServerNow } from '@/components/useNow';
import { parseBfen, type Piece } from '@/game/bfen';
import { firstMoveSecondsLeft } from '@/game/clock';
import { coachTip, isCoached } from '@/game/coach';
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
import { EMOTE_SHOWN_MS, EMOTES, emoteText, emotesOpen } from '@/game/emotes';
import { useGame, useGameAction, useMove, useSendEmote, useShownEmote } from '@/game/hooks';
import { candidateMoves, premoveDecision } from '@/game/premove';
import { boardSize, gameLayout } from '@/game/layout';
import { TIME_CONTROLS } from '@/lobby/format';
import { useCreateChallenge, useOpenStartedGame } from '@/lobby/hooks';
import { colors, spacing, type } from '@/theme';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const query = useGame(id, me.id);
  const move = useMove(id);
  const action = useGameAction(id);
  const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState<number | null>(null); // the move being replayed
  const game = query.data;
  const look = useAppearance();
  const chooseLook = useChooseAppearance();
  const soundOn = look.sounds_on;
  useMoveSounds(game, soundOn, look.sounds);
  const [ending, dismissEnding] = useEnding(game, me.id, soundOn, look.sounds);
  const plan = useMyPlan();
  const allowed = plan.data === undefined ? undefined : has(plan.data, 'analysis');
  const reviewable = game?.status === 'finished' && game.ply > 0;
  const analysis = useAnalysis(id, reviewable && allowed === true);
  const shownEmote = useShownEmote(id);
  const now = useNow(1000); // also re-renders each second, so a message disappears on time
  const serverNow = useServerNow(1000);
  // Leaving a game of mine while it is on asks first: it goes on without me.
  const navigation = useNavigation();
  const playing = game?.status === 'active' && sideOf(game, me.id) !== null;
  const [leaving, setLeaving] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const [mayLeave, setMayLeave] = useState(false);
  usePreventRemove(playing && !mayLeave, ({ data }) => setLeaving(data.action));
  // A premove: chosen on the opponent's turn (at `ply`), played as soon as it is my turn if
  // still legal then. Once the game moves past it, it simply no longer applies.
  const [premove, setPremove] = useState<{ move: string; ply: number } | null>(null);
  const played = useRef<string | null>(null);
  const myTurnNow =
    game?.status === 'active' && game.side_to_move === sideOf(game, me.id) && !move.isPending;
  useEffect(() => {
    if (game === undefined || premove === null || game.ply !== premove.ply + 1) return;
    const key = `${premove.ply}:${premove.move}`;
    if (played.current === key) return;
    if (premoveDecision(premove.move, myTurnNow, game.legal_moves) !== 'play') return;
    played.current = key;
    move.mutate({ ply: game.ply, move: premove.move });
  }, [game, premove, myTurnNow, move]);
  const waitingPremove =
    game !== undefined && premove !== null && game.status === 'active' && game.ply === premove.ply
      ? premove.move
      : null;
  useEffect(() => {
    if (mayLeave && leaving !== null) navigation.dispatch(leaving);
  }, [mayLeave, leaving, navigation]);

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
  // Games against the Easy computer come with tips, and goats in danger marked on the board.
  const tip = isCoached(game, mine) ? coachTip(game, mine) : null;
  // On the opponent's turn I may line up my next move.
  const premoving =
    game.status === 'active' && mine !== null && game.side_to_move !== mine && ply === game.ply;
  const boardMoves = myTurn
    ? game.legal_moves
    : premoving && position !== null
      ? candidateMoves(position, mine)
      : [];

  const board =
    position === null ? (
      <Notice tone="error">This position could not be shown.</Notice>
    ) : (
      <Board
        key={`${game.ply}-${ply}`}
        position={position}
        legalMoves={boardMoves}
        lastMove={waitingPremove ?? (ply > 0 ? game.moves[ply - 1] : undefined)}
        onMove={(m) =>
          myTurn ? move.mutate({ ply: game.ply, move: m }) : setPremove({ move: m, ply: game.ply })
        }
        theme={look.board}
        pieces={look.pieces}
        danger={tip !== null && myTurn && ply === game.ply ? game.goats_in_danger : []}
      />
    );

  // A quick message shows on its sender's bar for a moment.
  const fresh =
    shownEmote !== undefined && shownEmote !== null && now - shownEmote.at < EMOTE_SHOWN_MS
      ? shownEmote
      : null;
  const emoteOf = (side: Piece) => (fresh?.side === side ? emoteText(fresh.emote) : null);
  const opponentBar = (
    <PlayerBar
      game={game}
      side={other(bottom)}
      isMe={mine === other(bottom)}
      emote={emoteOf(other(bottom))}
    />
  );
  const myBar = (
    <PlayerBar game={game} side={bottom} isMe={mine === bottom} emote={emoteOf(bottom)} />
  );

  const panel = (
    <View style={styles.panel}>
      {layout === 'short' && opponentBar}
      {layout === 'short' && myBar}
      <Status game={game} mine={mine} />
      {game.status === 'finished' && (
        // What next, straight after the result: play again, or back to the lobby.
        <View style={styles.next}>
          {mine !== null &&
            (game.computer === null ? (
              <Rematch game={game} mine={mine} />
            ) : (
              <PlayAgain game={game} mine={mine} />
            ))}
          <Button
            title="Back to the lobby"
            variant="secondary"
            onPress={() => router.navigate('/')}
          />
        </View>
      )}
      {waitingPremove !== null && (
        <View style={styles.premove}>
          <Text style={styles.premoveText}>
            {`Premove: ${waitingPremove}, played when it is your turn`}
          </Text>
          <Button
            title="Cancel the premove"
            label="Cancel"
            variant="secondary"
            compact
            onPress={() => setPremove(null)}
          />
        </View>
      )}
      {tip !== null && <Coach tip={tip} />}
      {replaying && <Replay ply={ply} total={game.ply} onShow={setShown} />}
      {error !== null && <Notice tone="error">{describeError(error)}</Notice>}
      {position !== null && (
        <View style={styles.countsRow}>
          <View style={styles.grow}>
            <PieceCounts
              inHand={position.inHand}
              captured={position.captured}
              pieces={look.pieces}
            />
          </View>
          {soundSupported() && game.status === 'active' && (
            <IconButton
              icon={soundOn ? 'sound' : 'mute'}
              title={soundOn ? 'Turn sounds off' : 'Turn sounds on'}
              selected={soundOn}
              onPress={() => chooseLook.mutate({ sounds_on: !soundOn })}
            />
          )}
        </View>
      )}
      {reviewable && (
        <AnalysisPanel
          game={game}
          allowed={allowed}
          analysis={analysis}
          ply={ply}
          onShow={setShown}
        />
      )}
      {mine !== null && emotesOpen(game, serverNow) && (
        <QuickMessages
          gameId={game.id}
          mine={mine}
          shown={look.emotes_on}
          onToggle={() => chooseLook.mutate({ emotes_on: !look.emotes_on })}
        />
      )}
      {mine !== null && <ChatPanel game={game} mine={mine} />}
      {mine !== null && game.status === 'active' && (
        <GameActions
          game={game}
          me={mine}
          pending={action.isPending ? action.variables : null}
          onAction={(a) => action.mutate(a)}
        />
      )}
      <SectionTitle>Moves</SectionTitle>
      <MoveList
        moves={annotate(game.moves, analysis.data?.moves ?? [])}
        {...(replaying && { current: ply, onShow: setShown })}
      />
      {game.status === 'finished' && mine !== null && !isComputer(game, other(mine)) && (
        <Button
          title={`Report ${playerOf(game, other(mine)).username}`}
          variant="secondary"
          compact
          onPress={() =>
            router.push(`/report/${playerOf(game, other(mine)).username}?game=${game.id}`)
          }
        />
      )}
    </View>
  );

  return (
    <Screen align="top" wide={wide}>
      <Stack.Screen options={{ title: `${nameOf(game, 'goat')} vs ${nameOf(game, 'tiger')}` }} />
      {leaving !== null && !mayLeave && (
        <Confirm
          question="Leave the game? It goes on without you, and your clock keeps running."
          confirmTitle="Leave the game"
          cancelTitle="Keep playing"
          onConfirm={() => setMayLeave(true)}
          onCancel={() => setLeaving(null)}
        />
      )}
      <View style={wide ? styles.row : styles.column}>
        <View style={wide ? styles.boardWide : styles.boardColumn}>
          {layout !== 'short' && opponentBar}
          <View style={[styles.boardBox, { maxWidth: boardSize(layout, width, height) }]}>
            {board}
            {ending !== null && (
              <Victory ending={ending} onClose={dismissEnding} pieces={look.pieces} />
            )}
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

/**
 * Quick messages to my opponent (set phrases), and whether theirs reach me: one setting,
 * the same as on the Board, pieces and sounds page.
 */
function QuickMessages({
  gameId,
  mine,
  shown,
  onToggle,
}: {
  gameId: string;
  mine: Piece;
  shown: boolean;
  onToggle: () => void;
}) {
  const send = useSendEmote(gameId, mine);
  return (
    <View style={styles.quick}>
      <View style={styles.emotes}>
        {EMOTES.map((e) => (
          <Button
            key={e.value}
            title={`Say “${e.label}”`}
            label={e.label}
            variant="secondary"
            compact
            disabled={send.isPending}
            onPress={() => send.mutate(e.value)}
          />
        ))}
        <IconButton
          icon="chat"
          title={shown ? "Hide your opponent's messages" : "Show your opponent's messages"}
          selected={shown}
          onPress={onToggle}
        />
      </View>
      {send.error !== null && <Notice tone="error">{describeError(send.error)}</Notice>}
    </View>
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
        time_control: timeControl ?? '5+3',
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
  next: { gap: spacing.sm },
  quick: { gap: spacing.sm },
  premove: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  premoveText: { ...type.body, flex: 1, color: colors.text },
  emotes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  turn: { fontSize: 18, fontWeight: '700', color: colors.text },
  counts: { fontSize: 14, color: colors.muted },
  countsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  matchTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  matchScore: { fontSize: 20, fontWeight: '700', color: colors.text },
});
