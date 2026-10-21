import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { TrainerKind } from '@/api/endpoints';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { PuzzleBoard } from '@/components/PuzzleBoard';
import { Upsell } from '@/components/Upsell';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { mark, t } from '@/i18n';
import { answerText, progressText } from '@/pro/format';
import { useAnswerPuzzle, useTrainer } from '@/pro/hooks';
import { colors } from '@/theme';
import { ErrorNotice } from '@/components/ErrorNotice';

const KINDS: readonly { value: TrainerKind; label: string }[] = [
  { value: 'opening', label: mark('Openings') },
  { value: 'endgame', label: mark('Endgames') },
];

/** Opening and endgame puzzles: find the one best move (Pro). */
export default function TrainerScreen() {
  const plan = useMyPlan();
  const [kind, setKind] = useState<TrainerKind>('opening');
  return (
    <Screen align="top">
      {plan.error !== null ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : plan.data === undefined ? (
        <Loading label={t('Loading your plan')} />
      ) : has(plan.data, 'trainer') ? (
        <>
          <Hint>
            {t(
              'Each position has one move clearly better than the rest. Openings come while goats are still being placed; endgames once all are on the board.',
            )}
          </Hint>
          <Segmented
            label={t('Puzzles')}
            options={KINDS.map((k) => ({ ...k, label: t(k.label) }))}
            value={kind}
            onChange={setKind}
          />
          <Puzzles key={kind} kind={kind} />
        </>
      ) : (
        <Upsell feature="trainer">
          {t(
            'Train with opening and endgame puzzles from real games, each with one best move to find.',
          )}
        </Upsell>
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
  if (trainer.data === undefined) return <Loading label={t('Loading a puzzle')} />;
  const puzzle = trainer.data.puzzle;
  return (
    <>
      <Text style={styles.progress}>{progressText(answer.data ?? trainer.data)}</Text>
      {puzzle === null ? (
        <Notice tone="success">{t('You have solved every puzzle here. Well played!')}</Notice>
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
      <ErrorNotice error={answer.error} />
      {answer.data !== undefined && (
        <>
          <Notice tone={answer.data.correct ? 'success' : 'info'}>{answerText(answer.data)}</Notice>
          <Button
            title={t('Next puzzle')}
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

const styles = StyleSheet.create({
  progress: { fontSize: 14, color: colors.muted },
});
