import { router } from 'expo-router';

import { describeError } from '@/api/errors';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { answerText } from '@/pro/format';
import { useAnswerPuzzle, useDailyPuzzle } from '@/pro/hooks';

import { Button } from './Button';
import { Card, Hint, SectionTitle } from './Card';
import { Notice } from './Notice';
import { PuzzleBoard } from './PuzzleBoard';
import { ErrorState, Loading } from './States';
import { Upsell } from './Upsell';

/**
 * Today's puzzle, from the trainer, for everyone: one move to find, then the answer and a new
 * puzzle tomorrow. Pro players go on to the trainer; others see what it adds.
 */
export function DailyPuzzle() {
  const daily = useDailyPuzzle();
  const answer = useAnswerPuzzle();
  const plan = useMyPlan();
  const result = daily.data?.answer ?? null;
  return (
    <>
      <SectionTitle>Daily puzzle</SectionTitle>
      {daily.error !== null ? (
        <ErrorState error={daily.error} onRetry={() => void daily.refetch()} />
      ) : daily.data === undefined ? (
        <Loading label="Loading today's puzzle" />
      ) : (
        <Card>
          <PuzzleBoard
            puzzle={daily.data.puzzle}
            answered={result !== null}
            best={result?.best}
            busy={answer.isPending}
            maxWidth={360}
            onMove={(move) =>
              answer.mutate(
                { id: daily.data.puzzle.id, move },
                { onSuccess: () => void daily.refetch() },
              )
            }
          />
          {answer.error !== null && <Notice tone="error">{describeError(answer.error)}</Notice>}
          {result !== null && (
            <>
              <Notice tone={result.correct ? 'success' : 'info'}>{answerText(result)}</Notice>
              <Hint>A new puzzle comes tomorrow.</Hint>
            </>
          )}
          {plan.data !== undefined &&
            (has(plan.data, 'trainer') ? (
              <Button
                title="More puzzles in the trainer"
                icon="puzzle"
                variant="secondary"
                onPress={() => router.push('/trainer')}
              />
            ) : (
              <Upsell feature="trainer">
                Train every day with opening and endgame puzzles from real games.
              </Upsell>
            ))}
        </Card>
      )}
    </>
  );
}
