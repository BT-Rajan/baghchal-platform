import type { UseQueryResult } from '@tanstack/react-query';
import { StyleSheet, Text } from 'react-native';

import {
  LEGEND,
  leftText,
  nextMistake,
  reviewText,
  scoreText,
  sideName,
  summary,
  VERDICT_NAMES,
} from '@/analysis/format';
import { useAnalyse } from '@/analysis/hooks';
import type { Analysis, Game } from '@/api/endpoints';
import { nameOf } from '@/game/describe';
import { t } from '@/i18n';
import { colors } from '@/theme';

import { Button } from '../Button';
import { Card, Hint, SectionTitle } from '../Card';
import { ErrorNotice } from '../ErrorNotice';
import { ErrorState, Loading } from '../States';
import { Upsell } from '../Upsell';

/**
 * The engine's review of a finished game: asked for once, then the verdict on the move being
 * replayed, a way to the next mistake, and each side's tally. Free players see what Plus adds.
 */
export function AnalysisPanel({
  game,
  allowed,
  analysis,
  ply,
  onShow,
}: {
  game: Game;
  /** Whether the player's plan has analysis; undefined while the plan loads. */
  allowed: boolean | undefined;
  analysis: UseQueryResult<Analysis | null>;
  ply: number;
  onShow: (ply: number) => void;
}) {
  const analyse = useAnalyse(game.id);
  if (allowed === undefined) return null;
  return (
    <>
      <SectionTitle>{t('Analysis')}</SectionTitle>
      {!allowed ? (
        <Upsell feature="analysis">
          {t('See the engine’s review of every move, and where the game turned.')}
        </Upsell>
      ) : analysis.error !== null ? (
        <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />
      ) : analysis.data === undefined ? (
        <Loading label={t('Loading the analysis')} />
      ) : analysis.data === null ? (
        <Card>
          <Hint>{t('The engine reviews every move and shows where the game turned.')}</Hint>
          <ErrorNotice error={analyse.error} />
          {/* Secondary: the screen's main action after a game is what to play next. */}
          <Button
            title={t('Analyse this game')}
            variant="secondary"
            busy={analyse.isPending}
            onPress={() => analyse.mutate()}
          />
        </Card>
      ) : (
        <Review game={game} analysis={analysis.data} ply={ply} onShow={onShow} />
      )}
    </>
  );
}

function Review({
  game,
  analysis,
  ply,
  onShow,
}: {
  game: Game;
  analysis: Analysis;
  ply: number;
  onShow: (ply: number) => void;
}) {
  const review = ply > 0 ? analysis.moves[ply - 1] : undefined;
  const next = nextMistake(analysis.moves, ply);
  const left = leftText(analysis.left_today);
  return (
    <Card>
      {review === undefined ? (
        <Hint>{t('Step through the moves to see what the engine thought of each.')}</Hint>
      ) : (
        <>
          <Text style={[styles.verdict, { color: VERDICT_COLORS[review.verdict] }]}>
            {t(VERDICT_NAMES[review.verdict])}
          </Text>
          <Text style={styles.text}>{reviewText(review)}</Text>
          <Text style={styles.muted}>
            {t('Before the move: {score}', { score: scoreText(review.score) })}
          </Text>
        </>
      )}
      <Button
        title={t('Next mistake')}
        variant="secondary"
        compact
        disabled={next === null}
        onPress={() => next !== null && onShow(next)}
      />
      {(['goat', 'tiger'] as const).map((side) => (
        <Text key={side} style={styles.text}>
          {t('{side} ({name}): {summary}', {
            side: sideName(side),
            name: nameOf(game, side),
            summary: summary(analysis.moves, side),
          })}
        </Text>
      ))}
      <Text style={styles.muted}>{t(LEGEND)}</Text>
      {left !== null && <Text style={styles.muted}>{left}</Text>}
    </Card>
  );
}

const VERDICT_COLORS = {
  best: colors.success,
  good: colors.success,
  inaccuracy: colors.muted,
  mistake: colors.accent,
  blunder: colors.danger,
} as const;

const styles = StyleSheet.create({
  verdict: { fontSize: 18, fontWeight: '700' },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
