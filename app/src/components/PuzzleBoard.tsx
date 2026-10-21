import { StyleSheet, Text, View } from 'react-native';

import type { TrainerPuzzle } from '@/api/endpoints';
import { useAppearance } from '@/appearance/hooks';
import { parseBfen } from '@/game/bfen';
import { puzzlePrompt } from '@/pro/format';
import { colors, spacing, type } from '@/theme';

import { Board, BoardUnavailable } from './game/Board';

/**
 * A puzzle on the player's own board: whose move it is, and the board to play it on. Once
 * answered, the board shows the best move, from where to where. Used by the trainer and the daily puzzle.
 */
export function PuzzleBoard({
  puzzle,
  answered,
  best,
  busy,
  onMove,
  onRetry,
  maxWidth = 480,
}: {
  puzzle: TrainerPuzzle;
  answered: boolean;
  best: string | undefined;
  busy: boolean;
  onMove: (move: string) => void;
  /** Loads the puzzle again, when its position could not be shown. */
  onRetry: () => void;
  maxWidth?: number;
}) {
  const look = useAppearance();
  const position = parseBfen(puzzle.position);
  return (
    <>
      <Text style={styles.prompt}>{puzzlePrompt(puzzle)}</Text>
      <View style={[styles.board, { maxWidth }]}>
        {position === null ? (
          <BoardUnavailable onRetry={onRetry} />
        ) : (
          <Board
            position={position}
            legalMoves={answered || busy ? [] : puzzle.legal_moves}
            best={answered ? best : undefined}
            onMove={onMove}
            theme={look.board}
            pieces={look.pieces}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  prompt: { ...type.heading, color: colors.text },
  // The board reads left to right in every language.
  board: { width: '100%', alignSelf: 'center', gap: spacing.sm, direction: 'ltr' },
});
