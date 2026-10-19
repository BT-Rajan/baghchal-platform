import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TrainerKind, TrainerPuzzle } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useAppearance } from '@/appearance/hooks';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Board } from '@/components/game/Board';
import { Notice } from '@/components/Notice';
import { ProGate } from '@/components/ProGate';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { parseBfen } from '@/game/bfen';
import { answerText, progressText, puzzlePrompt } from '@/pro/format';
import { useAnswerPuzzle, useTrainer } from '@/pro/hooks';
import { colors, spacing } from '@/theme';

const KINDS: readonly { value: TrainerKind; label: string }[] = [
  { value: 'opening', label: 'Openings' },
  { value: 'endgame', label: 'Endgames' },
];

/** Opening and endgame puzzles: find the one best move (Pro). */
export default function TrainerScreen() {
  const plan = useMyPlan();
  const [kind, setKind] = useState<TrainerKind>('opening');
  return (
    <Screen title="Trainer" align="top">
      {plan.error !== null ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : plan.data === undefined ? (
        <Loading label="Loading your plan" />
      ) : has(plan.data, 'trainer') ? (
        <>
          <Hint>
            Each position has one move clearly better than the rest. Openings come while goats are
            still being placed; endgames once all are on the board.
          </Hint>
          <Segmented label="Puzzles" options={KINDS} value={kind} onChange={setKind} />
          <Puzzles key={kind} kind={kind} />
        </>
      ) : (
        <ProGate>
          The opening and endgame trainer comes with ClawPlay Pro: puzzles from real games, each
          with one best move to find.
        </ProGate>
      )}
    </Screen>
  );
}

function Puzzles({ kind }: { kind: TrainerKind }) {
  const trainer = useTrainer(kind);
  const answer = useAnswerPuzzle();
  if (trainer.error !== null) {
    return <ErrorState error={trainer.error} onRetry={() => void trainer.refetch()} />;
  }
  if (trainer.data === undefined) return <Loading label="Loading a puzzle" />;
  const puzzle = trainer.data.puzzle;
  return (
    <>
      <Text style={styles.progress}>{progressText(answer.data ?? trainer.data)}</Text>
      {puzzle === null ? (
        <Notice tone="success">You have solved every puzzle here. Well played!</Notice>
      ) : (
        <PuzzleBoard
          key={puzzle.id}
          puzzle={puzzle}
          answered={answer.data !== undefined && answer.variables.id === puzzle.id}
          best={answer.data?.best}
          busy={answer.isPending}
          onMove={(move) => answer.mutate({ id: puzzle.id, move })}
        />
      )}
      {answer.error !== null && <Notice tone="error">{describeError(answer.error)}</Notice>}
      {answer.data !== undefined && (
        <>
          <Notice tone={answer.data.correct ? 'success' : 'info'}>{answerText(answer.data)}</Notice>
          <Button
            title="Next puzzle"
            onPress={() => {
              answer.reset();
              void trainer.refetch();
            }}
          />
        </>
      )}
    </>
  );
}

function PuzzleBoard({
  puzzle,
  answered,
  best,
  busy,
  onMove,
}: {
  puzzle: TrainerPuzzle;
  answered: boolean;
  best: string | undefined;
  busy: boolean;
  onMove: (move: string) => void;
}) {
  const look = useAppearance();
  const position = parseBfen(puzzle.position);
  return (
    <>
      <Text style={styles.prompt}>{puzzlePrompt(puzzle)}</Text>
      <View style={styles.board}>
        {position === null ? (
          <Notice tone="error">This position could not be shown.</Notice>
        ) : (
          <Board
            position={position}
            legalMoves={answered || busy ? [] : puzzle.legal_moves}
            lastMove={answered ? best : undefined}
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
  progress: { fontSize: 14, color: colors.muted },
  prompt: { fontSize: 18, fontWeight: '700', color: colors.text },
  board: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.sm },
});
