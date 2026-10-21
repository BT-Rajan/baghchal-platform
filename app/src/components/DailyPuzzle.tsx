import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { describeError } from '@/api/errors';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { t } from '@/i18n';
import { answerText, dailyStreakText } from '@/pro/format';
import { useAnswerPuzzle, useDailyPuzzle } from '@/pro/hooks';
import { colors, type } from '@/theme';

import { Button } from './Button';
import { Card, Hint, SectionTitle } from './Card';
import { Disclosure } from './Disclosure';
import { Notice } from './Notice';
import { PuzzleBoard } from './PuzzleBoard';
import { ErrorState, Loading } from './States';
import { Upsell } from './Upsell';

/**
 * Today's puzzle, from the trainer, for everyone: one move to find, then the answer and a new
 * puzzle tomorrow (the answered board folds away, to keep the home screen short). Pro players
 * go on to the trainer; others see what it adds.
 */
export function DailyPuzzle() {
  const daily = useDailyPuzzle();
  const answer = useAnswerPuzzle();
  const plan = useMyPlan();
  const result = daily.data?.answer ?? null;
  const streak = dailyStreakText(daily.data?.streak ?? 0);
  const board = daily.data !== undefined && (
    <PuzzleBoard
      puzzle={daily.data.puzzle}
      answered={result !== null}
      best={result?.best}
      busy={answer.isPending}
      maxWidth={280}
      onMove={(move) =>
        answer.mutate({ id: daily.data.puzzle.id, move }, { onSuccess: () => void daily.refetch() })
      }
    />
  );
  return (
    <>
      <SectionTitle>{t('Daily puzzle')}</SectionTitle>
      {daily.error !== null ? (
        <ErrorState error={daily.error} onRetry={() => void daily.refetch()} />
      ) : daily.data === undefined ? (
        <Loading label={t("Loading today's puzzle")} />
      ) : (
        <Card>
          {streak !== null && <Text style={styles.streak}>{streak}</Text>}
          {result === null ? board : <Disclosure title={t("Today's position")}>{board}</Disclosure>}
          {answer.error !== null && <Notice tone="error">{describeError(answer.error)}</Notice>}
          {result !== null && (
            <>
              <Notice tone={result.correct ? 'success' : 'info'}>{answerText(result)}</Notice>
              <Hint>{t('A new puzzle comes tomorrow.')}</Hint>
            </>
          )}
          {plan.data !== undefined &&
            (has(plan.data, 'trainer') ? (
              <Button
                title={t('More puzzles in the trainer')}
                icon="puzzle"
                variant="secondary"
                onPress={() => router.push('/trainer')}
              />
            ) : (
              <Upsell feature="trainer">
                {t('Train every day with opening and endgame puzzles from real games.')}
              </Upsell>
            ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  streak: { ...type.label, color: colors.accent },
});
