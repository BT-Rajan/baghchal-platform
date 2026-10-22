import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Game, GameAction } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { isComputer, other, playerOf } from '@/game/describe';
import { t } from '@/i18n';
import { AWAY_REFRESH_MS, PRESENCE_REFRESH_MS, useProfile } from '@/lobby/hooks';
import { colors, radius, spacing, type } from '@/theme';

import { Button } from '../Button';
import { Card } from '../Card';
import { Confirm } from '../Confirm';
import { focusRing } from '../focus';
import { Icon, type IconName } from '../Icon';
import { pressedLook, ripple } from '../press';
import { useNow } from '../useNow';

export interface GameActionsProps {
  game: Game;
  me: Piece;
  onAction: (action: GameAction) => void;
  pending: GameAction | null;
  /** Why the last action failed: shown in the question that asked for it, which stays open. */
  error?: unknown;
}

/** How long the opponent must have been offline on their turn (the server checks it too). */
export const CLAIM_WAIT_MS = 60_000;

/**
 * The game's controls, as one row of labelled icon buttons: abort (before both sides have
 * moved, except in the second game of a match; asking first when it counts toward the daily
 * limit) or resign (asking first), offer a draw (not against the computer), and undo (in
 * casual games only: at once against the computer, as a takeback request to a person). Above
 * them, a draw or takeback my opponent offers me, and the win to claim once they have been
 * offline for a minute on their turn. The server decides whether each succeeds.
 */
export function GameActions({ game, me, onAction, pending, error }: GameActionsProps) {
  const [confirming, setConfirming] = useState<'abort' | 'resign' | null>(null);
  // The question stays open while its answer is carried out, and after a failure (to show
  // why); it closes once the action has gone through.
  const [asked, setAsked] = useState<{ action: GameAction; started: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  if (asked !== null && !asked.started && pending === asked.action) {
    setAsked({ ...asked, started: true });
  }
  if (asked?.started === true && pending !== asked.action) {
    setAsked(null);
    if (error === null || error === undefined) setConfirming(null);
    else setFailed(true);
  }
  const opponent = playerOf(game, other(me));
  const computer = isComputer(game, other(me));
  const opening = game.ply < 2;
  const waitingOnOpponent = !opening && game.side_to_move !== me;
  // The computer never leaves, so there is nobody to watch for.
  const watching = waitingOnOpponent && !computer;
  const [awaySince, setAwaySince] = useState<number | null>(null);
  // Check more often once they seem to have gone, so the claim is offered promptly.
  const presence = useProfile(
    opponent.username,
    watching,
    awaySince === null ? PRESENCE_REFRESH_MS : AWAY_REFRESH_MS,
  );
  const { refetch } = presence;
  // A fresh look when their turn starts, so the countdown never starts from an older one.
  useEffect(() => {
    if (watching) void refetch();
  }, [watching, game.ply, refetch]);
  const away = watching && presence.data?.online === false;
  // When we first saw them offline, this time round. Our view lags the server's (we poll), so
  // by the time our wait is over, theirs is too.
  if (away && awaySince === null) setAwaySince(presence.dataUpdatedAt);
  if (!away && awaySince !== null) setAwaySince(null);
  const now = useNow();
  const claimIn = awaySince === null ? null : Math.max(0, awaySince + CLAIM_WAIT_MS - now);

  // Abort while it is still the opening (game 2 of a match cannot be aborted: resign instead).
  const abortable = opening && game.match?.game !== 2;
  // Leaving the computer harms nobody, so aborting it does not count (the server agrees).
  const abortCounts = !computer;
  // Draws: once both have moved, between people. An offer stands until answered or moved past.
  const drawable = !computer && !opening;
  const offeredToMe = drawable && game.draw_offer === other(me);
  const iOffered = drawable && game.draw_offer === me;
  // Undo: the server says how ('none' in rated and tournament games, and while a takeback
  // request is open); only after a move of mine. An open request is answered or awaited here.
  const undo = game.undo;
  const iMoved = game.ply >= (me === 'goat' ? 1 : 2);
  const takebackToMe = game.takeback_offer === other(me);
  const iAskedTakeback = game.takeback_offer === me;
  const busy = pending !== null;

  const question =
    confirming === 'abort'
      ? {
          question: t('Abort? It counts toward your 3 a day.'),
          confirmTitle: t('Abort'),
        }
      : { question: t('Resign?'), confirmTitle: t('Resign') };

  return (
    <Confirm
      open={confirming !== null}
      {...question}
      cancelTitle={t('Keep playing')}
      busy={confirming !== null && pending === confirming}
      error={confirming !== null && failed ? error : undefined}
      onConfirm={() => {
        if (confirming === null) return;
        setFailed(false);
        setAsked({ action: confirming, started: false });
        onAction(confirming);
      }}
      onCancel={() => {
        setFailed(false);
        setConfirming(null);
      }}
    >
      <View style={styles.actions}>
        {offeredToMe && (
          // An offer to answer, not an action to confirm: it stays in the panel, beside the board.
          <Offer
            text={t('{name} offers a draw.', { name: opponent.username })}
            acceptTitle={t('Accept the draw')}
            accept="draw"
            decline="draw/decline"
            pending={pending}
            onAction={onAction}
          />
        )}
        {takebackToMe && (
          <Offer
            text={t('{name} asks to take back a move', { name: opponent.username })}
            acceptTitle={t('Accept the takeback')}
            accept="undo/accept"
            decline="undo/decline"
            pending={pending}
            onAction={onAction}
          />
        )}
        {claimIn !== null && claimIn > 0 && (
          <Text style={styles.away} aria-live="polite">
            {t('{name} is away. Claim the win in {seconds} s.', {
              name: opponent.username,
              seconds: Math.ceil(claimIn / 1000),
            })}
          </Text>
        )}
        {claimIn === 0 && (
          <Button
            title={t('Claim the win')}
            busy={pending === 'claim-abandonment'}
            onPress={() => onAction('claim-abandonment')}
          />
        )}
        <View style={styles.row}>
          {abortable ? (
            <Control
              icon="close"
              title={t('Abort game')}
              label={t('Abort')}
              busy={pending === 'abort'}
              disabled={busy}
              onPress={() => (abortCounts ? setConfirming('abort') : onAction('abort'))}
            />
          ) : (
            <Control
              icon="flag"
              title={t('Resign')}
              busy={pending === 'resign'}
              disabled={busy}
              onPress={() => setConfirming('resign')}
            />
          )}
          {drawable && !offeredToMe && (
            <Control
              icon="draw"
              title={iOffered ? t('Draw offered') : t('Offer a draw')}
              label={iOffered ? t('Offered') : t('Draw')}
              busy={pending === 'draw'}
              disabled={iOffered || busy}
              onPress={() => onAction('draw')}
            />
          )}
          {(undo !== 'none' || iAskedTakeback) && (
            <Control
              icon="undo"
              title={
                iAskedTakeback
                  ? t('Takeback requested')
                  : undo === 'now'
                    ? t('Take back your move')
                    : t('Ask to take back your move')
              }
              label={iAskedTakeback ? t('Requested') : t('Undo')}
              busy={pending === 'undo'}
              disabled={!iMoved || iAskedTakeback || takebackToMe || busy}
              onPress={() => onAction('undo')}
            />
          )}
        </View>
      </View>
    </Confirm>
  );
}

/** My opponent's draw or takeback offer, answered here. */
function Offer({
  text,
  acceptTitle,
  accept,
  decline,
  pending,
  onAction,
}: {
  text: string;
  acceptTitle: string;
  accept: GameAction;
  decline: GameAction;
  pending: GameAction | null;
  onAction: (action: GameAction) => void;
}) {
  return (
    <Card tone="accent">
      <Text style={styles.offer}>{text}</Text>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Button
            title={acceptTitle}
            label={t('Accept')}
            busy={pending === accept}
            disabled={pending === decline}
            onPress={() => onAction(accept)}
          />
        </View>
        <View style={styles.cell}>
          <Button
            title={t('Decline')}
            variant="secondary"
            busy={pending === decline}
            disabled={pending === accept}
            onPress={() => onAction(decline)}
          />
        </View>
      </View>
    </Card>
  );
}

/** One of the game's controls: an icon over a one-word label, at least 56 tall (over Android's 48). */
function Control({
  icon,
  title,
  label = title,
  onPress,
  busy = false,
  disabled = false,
}: {
  icon: IconName;
  /** The accessible name. */
  title: string;
  label?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-busy={busy}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      {...ripple()}
      style={(state) => [
        styles.control,
        pressedLook(state.pressed, styles.pressed),
        inactive && styles.dim,
        focusRing(state),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Icon name={icon} color={colors.text} size={24} />
      )}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  away: { ...type.body, color: colors.text },
  offer: { ...type.body, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  control: {
    flex: 1,
    minHeight: 56,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    // Keeps Android's ripple inside the rounded corners.
    overflow: 'hidden',
  },
  label: { ...type.action, color: colors.text },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
  dim: { opacity: 0.55 },
});
