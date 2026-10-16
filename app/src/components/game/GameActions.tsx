import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Game, GameAction } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { other, playerOf } from '@/game/describe';
import { useProfile } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

import { Button } from '../Button';

export interface GameActionsProps {
  game: Game;
  me: Piece;
  onAction: (action: GameAction) => void;
  pending: GameAction | null;
}

/**
 * Abort (before both sides have moved), resign (with a confirmation), and claim the win when
 * the opponent is offline on their turn. The server decides whether each succeeds.
 */
export function GameActions({ game, me, onAction, pending }: GameActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const opponent = playerOf(game, other(me));
  const opening = game.ply < 2;
  const waitingOnOpponent = !opening && game.side_to_move !== me;
  const presence = useProfile(opponent.username, waitingOnOpponent);
  const opponentAway = waitingOnOpponent && presence.data?.online === false;

  if (opening) {
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
    <View style={styles.row}>
      <View style={styles.cell}>
        <Button
          title="Resign"
          variant="secondary"
          busy={pending === 'resign'}
          onPress={() => setConfirming(true)}
        />
      </View>
      {opponentAway && (
        <View style={styles.cell}>
          <Button
            title="Claim the win"
            busy={pending === 'claim-abandonment'}
            onPress={() => onAction('claim-abandonment')}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: spacing.sm },
  question: { fontSize: 16, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
});
