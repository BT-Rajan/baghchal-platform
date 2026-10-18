import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Game, GameAction } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { isComputer, other, playerOf } from '@/game/describe';
import { AWAY_REFRESH_MS, PRESENCE_REFRESH_MS, useProfile } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

import { Button } from '../Button';
import { useNow } from '../useNow';

export interface GameActionsProps {
  game: Game;
  me: Piece;
  onAction: (action: GameAction) => void;
  pending: GameAction | null;
}

/** How long the opponent must have been offline on their turn (the server checks it too). */
export const CLAIM_WAIT_MS = 60_000;

/**
 * Abort (before both sides have moved, except in the second game of a match), resign (with a
 * confirmation), and claim the win once the opponent has been offline for a minute on their
 * turn. The server decides whether each succeeds.
 */
export function GameActions({ game, me, onAction, pending }: GameActionsProps) {
  const [confirming, setConfirming] = useState(false);
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

  if (opening && game.match?.game !== 2) {
    return (
      <Button
        title="Abort game"
        variant="secondary"
        busy={pending === 'abort'}
        onPress={() => onAction('abort')}
      />
    );
  }
  if (confirming) {
    return (
      <View style={styles.confirm}>
        <Text style={styles.question}>Resign this game?</Text>
        <View style={styles.row}>
          <View style={styles.cell}>
            <Button
              title="Yes, resign"
              busy={pending === 'resign'}
              onPress={() => {
                setConfirming(false);
                onAction('resign');
              }}
            />
          </View>
          <View style={styles.cell}>
            <Button title="Keep playing" variant="secondary" onPress={() => setConfirming(false)} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.confirm}>
      {claimIn !== null && claimIn > 0 && (
        <Text style={styles.away} aria-live="polite">
          {`${opponent.username} seems to have left. If they are not back in ` +
            `${Math.ceil(claimIn / 1000)} s, you can claim the win.`}
        </Text>
      )}
      <View style={styles.row}>
        <View style={styles.cell}>
          <Button
            title="Resign"
            variant="secondary"
            busy={pending === 'resign'}
            onPress={() => setConfirming(true)}
          />
        </View>
        {claimIn === 0 && (
          <View style={styles.cell}>
            <Button
              title="Claim the win"
              busy={pending === 'claim-abandonment'}
              onPress={() => onAction('claim-abandonment')}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: spacing.sm },
  question: { fontSize: 16, fontWeight: '600', color: colors.text },
  away: { fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
});
