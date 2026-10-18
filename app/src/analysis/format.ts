/** Words for the engine's review of a finished game. */
import type { MoveReview, Verdict } from '@/api/endpoints';

type Side = MoveReview['side'];

export const VERDICT_NAMES: Record<Verdict, string> = {
  best: 'Best move',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** The marks chess players know, after a move in the list: "c4??". */
export const MARKS: Record<Verdict, string> = {
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

export const LEGEND = '?! inaccuracy · ? mistake · ?? blunder';

const PLURALS: Record<Verdict, string> = {
  best: 'best',
  good: 'good',
  inaccuracy: 'inaccuracies',
  mistake: 'mistakes',
  blunder: 'blunders',
};

const SIDES: Record<Side, string> = { goat: 'Goats', tiger: 'Tigers' };

/** The moves with their marks, for the move list. */
export function annotate(moves: readonly string[], reviews: readonly MoveReview[]): string[] {
  return moves.map((move, i) => {
    const review = reviews[i];
    return review === undefined ? move : `${move}${MARKS[review.verdict]}`;
  });
}

/** "Move 3, goats c4: a blunder. The engine's choice was b2." */
export function reviewText(review: MoveReview): string {
  const played = `Move ${review.ply}, ${review.side}s ${review.move}`;
  switch (review.verdict) {
    case 'best':
      return `${played}: the engine's choice.`;
    case 'good':
      return `${played}: good. The engine slightly preferred ${review.best}.`;
    default:
      return `${played}: ${VERDICT_NAMES[review.verdict].toLowerCase()}. The engine's choice was ${review.best}.`;
  }
}

/** The position before a move, with best play: "Tigers ahead (+1.2)", "About even". */
export function scoreText(score: number): string {
  const side = score > 0 ? 'Tigers' : 'Goats';
  const size = Math.abs(score);
  if (size < 100) return 'About even';
  if (size >= 5000) return `${side} winning`;
  return `${side} ahead (+${(size / 1000).toFixed(1)})`;
}

/** "3 best · 1 good · 2 blunders" for one side's moves; verdicts with no moves are left out. */
export function summary(reviews: readonly MoveReview[], side: Side): string {
  const mine = reviews.filter((r) => r.side === side);
  if (mine.length === 0) return 'No moves';
  const parts = (Object.keys(VERDICT_NAMES) as Verdict[]).flatMap((verdict) => {
    const n = mine.filter((r) => r.verdict === verdict).length;
    if (n === 0) return [];
    return [`${n} ${n === 1 ? verdict : PLURALS[verdict]}`];
  });
  return parts.join(' · ');
}

export function sideName(side: Side): string {
  return SIDES[side];
}

/** The ply of the next mistake or blunder after `ply`, or null. */
export function nextMistake(reviews: readonly MoveReview[], ply: number): number | null {
  const next = reviews.find(
    (r) => r.ply > ply && (r.verdict === 'mistake' || r.verdict === 'blunder'),
  );
  return next?.ply ?? null;
}

/** "4 analyses left today." — null when there is no limit. */
export function leftText(left: number | null | undefined): string | null {
  if (left === null || left === undefined) return null;
  if (left === 0) return 'No new analyses left today; more tomorrow.';
  return `${left} ${left === 1 ? 'analysis' : 'analyses'} of new games left today.`;
}
