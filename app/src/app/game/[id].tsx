import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  usePreventRemove,
} from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { annotate } from '@/analysis/format';
import { useAnalysis } from '@/analysis/hooks';
import type { Game } from '@/api/endpoints';
import { useAppearance, useChooseAppearance } from '@/appearance/hooks';
import { useMe } from '@/auth/session';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ChallengeOutcome } from '@/components/ChallengeOutcome';
import { Confirm } from '@/components/Confirm';
import { ErrorNotice } from '@/components/ErrorNotice';
import { AnalysisPanel } from '@/components/game/AnalysisPanel';
import { Board, BoardUnavailable } from '@/components/game/Board';
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
import { showingGame } from '@/game/onScreen';
import { candidateMoves, premoveDecision } from '@/game/premove';
import { boardSize, gameLayout } from '@/game/layout';
import { isOpen, TIME_CONTROLS } from '@/lobby/format';
import { isRTL, plural, t } from '@/i18n';
import {
  useChallengeOutcomes,
  useChallenges,
  useCreateChallenge,
  usePlayComputer,
} from '@/lobby/hooks';
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
  // While this screen is in front, a match's game 2 is opened from here, after its countdown.
  useFocusEffect(useCallback(() => showingGame(id), [id]));
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
  // A premove the opponent's reply made impossible: say so, rather than let it vanish.
  const droppedPremove =
    game !== undefined &&
    premove !== null &&
    game.ply === premove.ply + 1 &&
    premoveDecision(premove.move, myTurnNow, game.legal_moves) === 'drop'
      ? premove.move
      : null;
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
        <Stack.Screen options={{ title: t('Game') }} />
        {query.error !== null ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <Loading label={t('Loading the game')} />
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
  const layout = gameLayout(width, height);
  const wide = layout !== 'stacked';
  // Games against the Easy computer come with tips (the board never marks goats in danger).
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
      <BoardUnavailable onRetry={() => void query.refetch()} />
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
      {/* Right after the status (above the chat on a phone): a draw offered to me, the win
          to claim, and my resign and draw buttons. */}
      {mine !== null && game.status === 'active' && (
        <GameActions
          game={game}
          me={mine}
          pending={action.isPending ? action.variables : null}
          onAction={(a) => action.mutate(a)}
        />
      )}
      <ErrorNotice error={action.error} />
      {game.status === 'finished' && (
        // What next, straight after the result: game 2 of the match, back to the tournament,
        // or play again; or back to Play.
        <View style={styles.next}>
          {mine !== null && <NextGame game={game} mine={mine} guest={me.role === 'guest'} />}
          <Button
            title={t('Back to Play')}
            variant="secondary"
            onPress={() => router.navigate('/')}
          />
        </View>
      )}
      {droppedPremove !== null && (
        <Notice tone="info">
          {t('Your premove {move} is no longer possible: make your move.', {
            move: droppedPremove,
          })}
        </Notice>
      )}
      {waitingPremove !== null && (
        <View style={styles.premove}>
          <Text style={styles.premoveText}>
            {t('Premove: {move}, played when it is your turn', { move: waitingPremove })}
          </Text>
          <Button
            title={t('Cancel the premove')}
            label={t('Cancel')}
            variant="secondary"
            compact
            onPress={() => setPremove(null)}
          />
        </View>
      )}
      {tip !== null && <Coach tip={tip} />}
      {replaying && <Replay ply={ply} total={game.ply} onShow={setShown} />}
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
              title={soundOn ? t('Turn sounds off') : t('Turn sounds on')}
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
      <SectionTitle>{t('Moves')}</SectionTitle>
      <MoveList
        moves={annotate(game.moves, analysis.data?.moves ?? [])}
        {...(replaying && { current: ply, onShow: setShown })}
      />
      {game.status === 'finished' && mine !== null && !isComputer(game, other(mine)) && (
        <Button
          title={t('Report {name}', { name: playerOf(game, other(mine)).username })}
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
      <Stack.Screen
        options={{
          title: t('{goat} vs {tiger}', {
            goat: nameOf(game, 'goat'),
            tiger: nameOf(game, 'tiger'),
          }),
        }}
      />
      {leaving !== null && !mayLeave && (
        <Confirm
          question={
            game.ply < 2 &&
            game.match?.game !== 2 &&
            mine !== null &&
            !isComputer(game, other(mine))
              ? t(
                  'Leave the game? If you do not make your first move it is aborted, which counts toward the limit of 3 a day.',
                )
              : t('Leave the game? It goes on without you, and your clock keeps running.')
          }
          confirmTitle={t('Leave the game')}
          cancelTitle={t('Keep playing')}
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
          {/* A refused move is explained where it was tried. */}
          <ErrorNotice error={move.error} />
          {layout !== 'short' && myBar}
        </View>
        {panel}
      </View>
    </Screen>
  );
}

/**
 * The main next step after a game, if there is one: game 2 of a rated match (after a short
 * countdown), back to the tournament it was played in, the computer again, or a rematch.
 */
function NextGame({ game, mine, guest }: { game: Game; mine: Piece; guest: boolean }) {
  const second = game.match?.game === 1 ? game.match.games[1] : undefined;
  if (second !== undefined) {
    return <GameTwoCountdown gameId={second} startsAt={game.match?.game_2_starts_at ?? null} />;
  }
  if (game.tournament !== null && game.tournament !== undefined) {
    const code = game.tournament;
    return (
      <Button
        title={t('Back to the tournament')}
        onPress={() => router.navigate(`/tournament/${code}`)}
      />
    );
  }
  if (game.computer !== null) return <PlayAgain game={game} mine={mine} />;
  // Guests cannot challenge by name, and game 1 of a match is followed by game 2.
  return guest || game.match !== null ? null : <Rematch game={game} mine={mine} />;
}

/**
 * Game 1's result stays on screen while game 2 counts down, then game 2 opens. Seen later
 * (from the history), game 1 just leads to game 2.
 */
function GameTwoCountdown({ gameId, startsAt }: { gameId: string; startsAt: string | null }) {
  const now = useServerNow(250);
  const left = startsAt === null ? 0 : Math.max(0, Math.ceil((Date.parse(startsAt) - now) / 1000));
  const [counting] = useState(left > 0);
  useEffect(() => {
    if (counting && left === 0) router.replace(`/game/${gameId}`);
  }, [counting, left, gameId]);
  const open = (
    <Button title={t('Play game 2 now')} onPress={() => router.replace(`/game/${gameId}`)} />
  );
  if (!counting)
    return <Button title={t('Go to game 2')} onPress={() => router.replace(`/game/${gameId}`)} />;
  return (
    <Card tone="accent">
      <Text style={styles.matchTitle} aria-live="polite">
        {plural(left, 'Game 2 starts in {count} second…', 'Game 2 starts in {count} seconds…')}
      </Text>
      {open}
    </Card>
  );
}

/**
 * Challenge the same player again: a casual game (rated matches are limited to one a day per
 * pair) with sides swapped. The answer is shown here, so the chat after the game stays open.
 */
function Rematch({ game, mine }: { game: Game; mine: Piece }) {
  const create = useCreateChallenge();
  const serverNow = useServerNow(1000);
  const outgoing = useChallenges().data?.outgoing ?? [];
  const outcomes = useChallengeOutcomes(serverNow);
  const timeControl = TIME_CONTROLS.find((tc) => tc.label === game.time_control)?.label;
  if (timeControl === undefined) return null;
  const opponent = playerOf(game, other(mine)).username;
  const sent = create.data;
  const waiting =
    sent !== undefined && outgoing.some((c) => c.id === sent.id && isOpen(c, serverNow));
  const outcome = sent === undefined ? undefined : outcomes.find((c) => c.id === sent.id);
  if (waiting) {
    return (
      <Notice tone="info">
        {t('Rematch sent. Waiting for {name} to answer…', { name: opponent })}
      </Notice>
    );
  }
  return (
    <>
      {outcome !== undefined && <ChallengeOutcome challenge={outcome} />}
      <ErrorNotice error={create.error} />
      <Button
        title={t('Rematch {name}', { name: opponent })}
        label={t('Rematch (casual, sides swapped)')}
        busy={create.isPending}
        onPress={() =>
          create.mutate({ opponent, time_control: timeControl, rated: false, side: other(mine) })
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
            title={t('Say “{message}”', { message: t(e.label) })}
            label={t(e.label)}
            variant="secondary"
            compact
            disabled={send.isPending}
            onPress={() => send.mutate(e.value)}
          />
        ))}
        <IconButton
          icon="chat"
          title={shown ? t("Hide your opponent's messages") : t("Show your opponent's messages")}
          selected={shown}
          onPress={onToggle}
        />
      </View>
      <ErrorNotice error={send.error} />
    </View>
  );
}

/**
 * Step through a finished game: start, back, forward, end. The row runs the language's way, so
 * in a right-to-left language the start is on the right and the arrows point that way.
 */
function Replay({
  ply,
  total,
  onShow,
}: {
  ply: number;
  total: number;
  onShow: (ply: number) => void;
}) {
  const rtl = isRTL();
  return (
    <View style={styles.replay}>
      <Text style={styles.counts}>
        {ply === 0 ? t('Start position') : t('After move {ply} of {total}', { ply, total })}
      </Text>
      <View style={styles.replayButtons}>
        <Button
          title={t('Start position')}
          label={rtl ? '⏭' : '⏮'}
          compact
          variant="secondary"
          disabled={ply === 0}
          onPress={() => onShow(0)}
        />
        <Button
          title={t('Previous move')}
          label={rtl ? '▶' : '◀'}
          compact
          variant="secondary"
          disabled={ply === 0}
          onPress={() => onShow(ply - 1)}
        />
        <Button
          title={t('Next move')}
          label={rtl ? '◀' : '▶'}
          compact
          variant="secondary"
          disabled={ply === total}
          onPress={() => onShow(ply + 1)}
        />
        <Button
          title={t('Final position')}
          label={rtl ? '⏮' : '⏭'}
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
  const start = usePlayComputer();
  const timeControl = TIME_CONTROLS.find((tc) => tc.label === game.time_control)?.label;
  return (
    <>
      <ErrorNotice error={start.error} />
      <Button
        title={t('Play the computer again')}
        label={t('Play again (sides swapped)')}
        busy={start.isPending}
        onPress={() =>
          start.mutate({
            level: game.computer ?? 'medium',
            side: other(mine),
            time_control: timeControl ?? '5+3',
          })
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
            : game.match?.game === 2
              ? t('{turn} · {seconds} s to make a first move, or it counts as a loss', {
                  turn,
                  seconds: firstMove,
                })
              : t('{turn} · {seconds} s to make a first move, or the game is aborted', {
                  turn,
                  seconds: firstMove,
                })}
        </Text>
      )}
      {match !== null && (
        <Card>
          <Text style={styles.matchTitle}>{match.title}</Text>
          {match.score !== '' && <Text style={styles.matchScore}>{match.score}</Text>}
          {/* Game 1 leads on to game 2 with its countdown (NextGame). */}
          {match.otherGameId !== null && game.match?.game === 2 && (
            <Button
              title={t('Back to game 1')}
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
  turn: { ...type.heading, color: colors.text },
  counts: { ...type.caption, color: colors.muted },
  countsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  matchTitle: { ...type.small, fontWeight: '600', color: colors.text },
  matchScore: { ...type.heading, color: colors.text },
});
