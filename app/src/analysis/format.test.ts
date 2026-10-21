import type { MoveReview } from '@/api/endpoints';

import { annotate, leftText, nextMistake, reviewText, scoreText, summary } from './format';

const review = (overrides: Partial<MoveReview> = {}): MoveReview => ({
  ply: 1,
  side: 'goat',
  move: 'c3',
  best: 'c3',
  loss: 0,
  verdict: 'best',
  score: 0,
  ...overrides,
});

test('marks follow the moves that have a review', () => {
  const reviews = [review({ verdict: 'inaccuracy' }), review({ ply: 2, verdict: 'mistake' })];
  expect(annotate(['c3', 'a1-b1', 'b2'], reviews)).toEqual(['c3?!', 'a1-b1?', 'b2']);
});

test('what the engine thought of a move', () => {
  expect(reviewText(review({ verdict: 'good', best: 'b2' }))).toBe(
    'Move 1, goats c3: good. The engine slightly preferred b2.',
  );
  expect(reviewText(review({ side: 'tiger', verdict: 'mistake', best: 'a1-b1' }))).toBe(
    "Move 1, tigers c3: mistake. The engine's choice was a1-b1.",
  );
});

test('scores in words', () => {
  expect(scoreText(99)).toBe('About even');
  expect(scoreText(-2500)).toBe('Goats ahead');
  expect(scoreText(1200)).toBe('Tigers ahead');
  expect(scoreText(5000)).toBe('Tigers winning');
  expect(scoreText(-5000)).toBe('Goats winning');
});

test("each side's tally", () => {
  const reviews = [
    review({ verdict: 'good' }),
    review({ verdict: 'good' }),
    review({ verdict: 'inaccuracy' }),
    review({ verdict: 'inaccuracy' }),
    review({ verdict: 'mistake' }),
    review({ verdict: 'mistake' }),
    review({ verdict: 'blunder' }),
  ];
  expect(summary(reviews, 'goat')).toBe('2 good · 2 inaccuracies · 2 mistakes · 1 blunder');
  expect(summary(reviews, 'tiger')).toBe('No moves');
  expect(summary([review({ side: 'tiger' })], 'tiger')).toBe('1 best');
});

test('the next mistake', () => {
  const reviews = [
    review({ verdict: 'blunder' }),
    review({ ply: 2 }),
    review({ ply: 3, verdict: 'mistake' }),
  ];
  expect(nextMistake(reviews, 0)).toBe(1);
  expect(nextMistake(reviews, 1)).toBe(3);
  expect(nextMistake(reviews, 3)).toBeNull();
});

test('analyses left today', () => {
  expect(leftText(null)).toBeNull();
  expect(leftText(undefined)).toBeNull();
  expect(leftText(0)).toBe('No new analyses left today; more tomorrow.');
  expect(leftText(1)).toBe('1 analysis of new games left today.');
});
