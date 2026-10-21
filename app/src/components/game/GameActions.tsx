import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Game, GameAction } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { isComputer, other, playerOf } from '@/game/describe';
import { t } from '@/i18n';
import { AWAY_REFRESH_MS, PRESENCE_REFRESH_MS, useProfile } from '@/lobby/hooks';
import { colors, spacing, type } from '@/theme';

import { Button } from '../Button';
import { Card } from '../Card';
import { Confirm } from '../Confirm';
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
 * Abort (before both sides have moved, except in the second game of a match; asking first when
 * it counts toward the daily limit), resign (with a confirmation), offer a draw or answer one
 * (not against the computer), and claim the win once the opponent has been offline for a minute
 * on their turn. The server decides whether each succeeds.
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
  const opening = game.ply < 2;
  const waitingOnOpponent = !opening && game.side_to_move !== me;
  // The computer never leaves, so there is nobody to watch for.
  const watching = waitingOnOpponent && !isComputer(game, other(me));
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

  const ask = (action: 'abort' | 'resign') => ({
    open: confirming === action,
    busy: pending === action,
    error: confirming === action && failed ? error : undefined,
    onConfirm: () => {
      setFailed(false);
      setAsked({ action, started: false });
      onAction(action);
    },
    onCancel: () => {
      setFailed(false);
      setConfirming(null);
    },
  });
  if (opening && game.match?.game !== 2) {
    // Leaving the computer harms nobody, so it does not count (the server agrees).
    const counts = !isComputer(game, other(me));
    return (
      <Confirm
        question={t('Abort the game? Aborting counts toward the limit of 3 a day.')}
        confirmTitle={t('Yes, abort')}
        cancelTitle={t('Keep playing')}
        {...ask('abort')}
      >
        <Button
          title={t('Abort game')}
          variant="secondary"
          busy={pending === 'abort'}
          onPress={() => (counts ? setConfirming('abort') : onAction('abort'))}
        />
      </Confirm>
    );
  }
  // Draws: once both have moved, between people. An offer stands until answered or moved past.
  // Not before both sides moved (the server refuses: game 2 of a match cannot be aborted).
  const drawable = !isComputer(game, other(me)) && !opening;
  const offeredToMe = drawable && game.draw_offer === other(me);
  const iOffered = drawable && game.draw_offer === me;
  return (
    <Confirm
      question={t('Resign this game?')}
      confirmTitle={t('Yes, resign')}
      cancelTitle={t('Keep playing')}
      {...ask('resign')}
    >
      <View style={styles.confirm}>
        {offeredToMe && (
          // An offer to answer, not an action to confirm: it stays in the panel, beside the board.
          <Card tone="accent">
            <Text style={styles.offer}>
              {t('{name} offers a draw.', { name: opponent.username })}
            </Text>
            <View style={styles.row}>
              <View style={styles.cell}>
                <Button
                  title={t('Accept the draw')}
                  busy={pending === 'draw'}
                  disabled={pending === 'draw/decline'}
                  onPress={() => onAction('draw')}
                />
              </View>
              <View style={styles.cell}>
                <Button
                  title={t('Decline')}
                  variant="secondary"
                  busy={pending === 'draw/decline'}
                  disabled={pending === 'draw'}
                  onPress={() => onAction('draw/decline')}
                />
              </View>
            </View>
          </Card>
        )}
        {claimIn !== null && claimIn > 0 && (
          <Text style={styles.away} aria-live="polite">
            {t(
              '{name} seems to have left. If they are not back in {seconds} s, you can claim the win.',
              { name: opponent.username, seconds: Math.ceil(claimIn / 1000) },
            )}
          </Text>
        )}
        <View style={styles.row}>
          <View style={styles.cell}>
            <Button
              title={t('Resign')}
              variant="secondary"
              busy={pending === 'resign'}
              onPress={() => setConfirming('resign')}
            />
          </View>
          {drawable && !offeredToMe && (
            <View style={styles.cell}>
              <Button
                title={iOffered ? t('Draw offered') : t('Offer a draw')}
                variant="secondary"
                busy={pending === 'draw'}
                disabled={iOffered}
                onPress={() => onAction('draw')}
              />
            </View>
          )}
          {claimIn === 0 && (
            <View style={styles.cell}>
              <Button
                title={t('Claim the win')}
                busy={pending === 'claim-abandonment'}
                onPress={() => onAction('claim-abandonment')}
              />
            </View>
          )}
        </View>
      </View>
    </Confirm>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: spacing.sm },
  away: { ...type.body, color: colors.text },
  offer: { ...type.body, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
});
