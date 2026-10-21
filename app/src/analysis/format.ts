/** Words for the engine's review of a finished game. */
import type { MoveReview, Verdict } from '@/api/endpoints';
import { mark, plural, t } from '@/i18n';

type Side = MoveReview['side'];

/** Each verdict's name (marked: `t()` it where it is shown). */
export const VERDICT_NAMES: Record<Verdict, string> = {
  best: mark('Best move'),
  good: mark('Good'),
  inaccuracy: mark('Inaccuracy'),
  mistake: mark('Mistake'),
  blunder: mark('Blunder'),
};

/** The marks chess players know, after a move in the list: "c4??". */
export const MARKS: Record<Verdict, string> = {
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/** How many moves had each verdict: "1 blunder", "2 blunders". */
const COUNTS: Record<Verdict, (n: number) => string> = {
  best: (n) => plural(n, '{count} best', '{count} best'),
  good: (n) => plural(n, '{count} good', '{count} good'),
  inaccuracy: (n) => plural(n, '{count} inaccuracy', '{count} inaccuracies'),
  mistake: (n) => plural(n, '{count} mistake', '{count} mistakes'),
  blunder: (n) => plural(n, '{count} blunder', '{count} blunders'),
};

const SIDES: Record<Side, string> = { goat: mark('Goats'), tiger: mark('Tigers') };

/** What the engine thought of a move, a whole sentence for each side and verdict. */
const REVIEWS: Record<Side, Record<Verdict, string>> = {
  goat: {
    best: mark("Move {ply}, goats {move}: the engine's choice."),
    good: mark('Move {ply}, goats {move}: good. The engine slightly preferred {best}.'),
    inaccuracy: mark("Move {ply}, goats {move}: inaccuracy. The engine's choice was {best}."),
    mistake: mark("Move {ply}, goats {move}: mistake. The engine's choice was {best}."),
    blunder: mark("Move {ply}, goats {move}: blunder. The engine's choice was {best}."),
  },
  tiger: {
    best: mark("Move {ply}, tigers {move}: the engine's choice."),
    good: mark('Move {ply}, tigers {move}: good. The engine slightly preferred {best}.'),
    inaccuracy: mark("Move {ply}, tigers {move}: inaccuracy. The engine's choice was {best}."),
    mistake: mark("Move {ply}, tigers {move}: mistake. The engine's choice was {best}."),
    blunder: mark("Move {ply}, tigers {move}: blunder. The engine's choice was {best}."),
  },
};

/** The moves with their marks, for the move list. */
export function annotate(moves: readonly string[], reviews: readonly MoveReview[]): string[] {
  return moves.map((move, i) => {
    const review = reviews[i];
    return review === undefined ? move : `${move}${MARKS[review.verdict]}`;
  });
}

/** "Move 3, goats c4: a blunder. The engine's choice was b2." */
export function reviewText(review: MoveReview): string {
  return t(REVIEWS[review.side][review.verdict], {
    ply: review.ply,
    move: review.move,
    best: review.best,
  });
}

/** The position before a move, with best play, in words: "Tigers ahead", "About even". */
export function scoreText(score: number): string {
  const tigers = score > 0;
  const size = Math.abs(score);
  if (size < 100) return t('About even');
  if (size >= 5000) return tigers ? t('Tigers winning') : t('Goats winning');
  return tigers ? t('Tigers ahead') : t('Goats ahead');
}

/** "3 best · 1 good · 2 blunders" for one side's moves; verdicts with no moves are left out. */
export function summary(reviews: readonly MoveReview[], side: Side): string {
  const mine = reviews.filter((r) => r.side === side);
  if (mine.length === 0) return t('No moves');
  const parts = (Object.keys(VERDICT_NAMES) as Verdict[]).flatMap((verdict) => {
    const n = mine.filter((r) => r.verdict === verdict).length;
    if (n === 0) return [];
    return [COUNTS[verdict](n)];
  });
  return parts.join(' · ');
}

export function sideName(side: Side): string {
  return t(SIDES[side]);
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
  if (left === 0) return t('No new analyses left today; more tomorrow.');
  return plural(
    left,
    '{count} analysis of new games left today.',
    '{count} analyses of new games left today.',
  );
}
